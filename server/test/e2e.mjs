// End-to-end check for stage 3: products / contracts / payments.
// Requires a running server (npm run dev in another tab).
//
// Tokens are signed here from JWT_SECRET — no admin password is needed, and
// the test does not depend on how anyone set their accounts up.

import 'dotenv/config'
import jwt from 'jsonwebtoken'
import { pool } from '../src/db/pool.js'

const API = `http://localhost:${process.env.PORT || 3000}/api`

let passed = 0, failed = 0
const ok = (cond, label, extra = '') => {
  cond ? passed++ : failed++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? '  → ' + extra : ''}`)
}

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  let json = null
  try { json = await res.json() } catch { /* empty body */ }
  return { status: res.status, ...json }
}

const sign = (u) => jwt.sign({ id: u.id, phone: u.phone, role: u.role }, process.env.JWT_SECRET, { expiresIn: '1h' })

const sum = (t) => (t / 100).toLocaleString('en-US') + ' sum'

// ── setup ─────────────────────────────────────────────────

// The test talks over HTTP, so the server has to be up. Without this check a
// failure looks like an ECONNREFUSED stack trace, and it is not obvious from
// there what to do about it.
try {
  await fetch(API + '/models')
} catch {
  console.error(`Server is not responding at ${API}`)
  console.error('Start it in another tab:  cd server && npm run dev')
  process.exit(1)
}

const admin = (await pool.query(`SELECT id, phone, role FROM users WHERE role='admin' LIMIT 1`)).rows[0]
if (!admin) {
  console.error('There is no user with role=admin. Make someone an admin and retry:')
  console.error(`  psql -U postgres -d molfi -c "UPDATE users SET role='admin' WHERE id=1"`)
  process.exit(1)
}
const adminToken = sign(admin)

// A separate buyer — so that real accounts are not damaged
const buyerPhone = '+998900000777'

// Cleaning up after the previous run: otherwise every run eats an animal and
// leaves offers hanging. Only what the test itself created is touched.
const prev = (await pool.query(`SELECT id FROM users WHERE phone=$1`, [buyerPhone])).rows[0]
if (prev) {
  await pool.query(
    `UPDATE animals SET status='active', sold_at=NULL, final_weight_g=NULL, final_sale_price_tiyin=NULL
     WHERE id IN (SELECT animal_id FROM contracts WHERE user_id=$1 AND animal_id IS NOT NULL)`,
    [prev.id]
  )
  await pool.query(`DELETE FROM transactions WHERE user_id=$1`, [prev.id])
  await pool.query(`DELETE FROM contracts WHERE user_id=$1`, [prev.id])
}
await pool.query(`DELETE FROM products WHERE title_en LIKE 'E2E %'`)

let buyer = (await pool.query(`SELECT id, phone, role FROM users WHERE phone=$1`, [buyerPhone])).rows[0]
if (!buyer) {
  buyer = (await pool.query(
    `INSERT INTO users (phone, name, role, referral_code) VALUES ($1,'E2E Test','user',$2) RETURNING id, phone, role`,
    [buyerPhone, 'E2E' + Date.now().toString(36).toUpperCase().slice(-5)]
  )).rows[0]
}
const buyerToken = sign(buyer)

// A wallet holding 50 million sum
await pool.query(
  `INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1, 5000000000)
   ON CONFLICT (user_id) DO UPDATE SET balance_tiyin = 5000000000`,
  [buyer.id]
)

// A free animal for the ownership model
const animal = (await pool.query(
  `SELECT id, name FROM animals
   WHERE status = 'active'
     AND id NOT IN (SELECT animal_id FROM contracts WHERE animal_id IS NOT NULL AND model_type='ownership' AND status IN ('pending','active'))
   ORDER BY id LIMIT 1`
)).rows[0]
if (!animal) { console.error('No free animal with status active'); process.exit(1) }

const farm = (await pool.query(`SELECT id FROM farms ORDER BY id LIMIT 1`)).rows[0]

console.log(`admin #${admin.id}, buyer #${buyer.id}, animal #${animal.id} "${animal.name}"`)

// Instalments are currently hidden through settings.models_enabled. The code
// is still live, and leaving it unchecked is not an option — sleeping,
// untested code rots. All models are enabled for the run and restored after.
const savedModels = (await pool.query(`SELECT value FROM settings WHERE key='models_enabled'`)).rows[0]?.value
  ?? 'ownership,fixed_income'
await call('PUT', '/admin/settings', { token: adminToken, body: { models_enabled: 'ownership,installment,fixed_income' } })
console.log(`models for this run: all three (in the database ${savedModels})\n`)

const restoreModels = async () => {
  await call('PUT', '/admin/settings', { token: adminToken, body: { models_enabled: savedModels } })
}
process.on('exit', () => { /* restored below, it can no longer be done synchronously */ })

// ── products ──────────────────────────────────────────────
console.log('── products ──')

const pOwn = await call('POST', '/admin/products', {
  token: adminToken,
  body: {
    model_type: 'ownership', animal_id: animal.id, farm_id: farm?.id,
    title_en: 'E2E ownership', price_tiyin: 65000000, status: 'active',
  },
})
ok(pOwn.success === true, 'POST /admin/products — ownership', pOwn.error)

const pInst = await call('POST', '/admin/products', {
  token: adminToken,
  body: {
    model_type: 'installment', farm_id: farm?.id, title_en: 'E2E installment',
    price_tiyin: 60000000, term_months: 6, meat_weight_g: 25000, status: 'active',
  },
})
ok(pInst.success === true, 'POST /admin/products — installment', pInst.error)

// A spare instalment offer: nobody buys it, it is needed at the very end to
// check the model lock on an active offer. On a sold-out one the earlier
// status check would fire first.
const pInstFree = await call('POST', '/admin/products', {
  token: adminToken,
  body: {
    model_type: 'installment', farm_id: farm?.id, title_en: 'E2E installment spare',
    price_tiyin: 60000000, term_months: 6, meat_weight_g: 25000, status: 'active',
  },
})

const pFix = await call('POST', '/admin/products', {
  token: adminToken,
  body: {
    model_type: 'fixed_income', farm_id: farm?.id, title_en: 'E2E fixed income',
    min_amount_tiyin: 100000000, term_months: 12, annual_rate_bp: 1800, status: 'active',
  },
})
ok(pFix.success === true, 'POST /admin/products — fixed_income', pFix.error)

const bad = await call('POST', '/admin/products', {
  token: adminToken,
  body: { model_type: 'installment', price_tiyin: 100, status: 'draft' },
})
ok(bad.success === false, 'installment without term_months rejected', bad.error)

const noAuth = await call('POST', '/admin/products', { body: { model_type: 'ownership' } })
ok(noAuth.status === 401, 'without a token — 401', String(noAuth.status))

const asUser = await call('POST', '/admin/products', { token: buyerToken, body: { model_type: 'ownership' } })
ok(asUser.status === 403, 'as a regular user — 403', String(asUser.status))

const list = await call('GET', '/products')
ok(Array.isArray(list.products), 'GET /products')

const filtered = await call('GET', '/products?model=fixed_income')
ok(filtered.products?.every(p => p.model_type === 'fixed_income'), 'GET /products?model=fixed_income filters')

const detail = await call('GET', `/products/${pOwn.product.id}`)
ok(detail.product?.animal_name === animal.name, 'GET /products/:id returns the animal', detail.product?.animal_name)
ok(Array.isArray(detail.weights), '  and the weight history')

// ── contracts ─────────────────────────────────────────────
console.log('\n── contracts ──')

const balBefore = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)

const cOwn = await call('POST', '/contracts', {
  token: buyerToken,
  body: { product_id: pOwn.product.id, exit_type: 'slaughter' },
})
ok(cOwn.success === true, 'POST /contracts — ownership', cOwn.error)
ok(cOwn.contract?.animal_id === animal.id, '  animal attached')
ok(cOwn.contract?.exit_type === 'slaughter', '  exit_type stored')

const balAfter = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)
ok(balBefore - balAfter === 65000000, 'the animal price was charged to the wallet', sum(balBefore - balAfter))

const animalStatus = (await pool.query(`SELECT status FROM animals WHERE id=$1`, [animal.id])).rows[0].status
ok(animalStatus === 'owned', 'animal marked owned', animalStatus)

// Slots ran out — the offer went sold_out by itself
const dup = await call('POST', '/contracts', { token: buyerToken, body: { product_id: pOwn.product.id } })
ok(dup.error === 'product_not_active' || dup.error === 'no_slots_left',
   'buying the same offer again is rejected', `${dup.status} ${dup.error}`)

// Race for the animal. A second offer on the same animal is the only way to
// reach the unique index: the slot check will not catch it. This is exactly
// what a real mistake looks like — an admin creating the offer twice.
const pOwnDup = await call('POST', '/admin/products', {
  token: adminToken,
  body: {
    model_type: 'ownership', animal_id: animal.id, farm_id: farm?.id,
    title_en: 'E2E ownership duplicate', price_tiyin: 65000000, status: 'active',
  },
})
ok(pOwnDup.success === true, 'second offer on the same animal created', pOwnDup.error)

const race = await call('POST', '/contracts', { token: buyerToken, body: { product_id: pOwnDup.product.id } })
ok(race.error === 'animal_already_sold', 'contract via the second offer rejected by 23505', `${race.status} ${race.error}`)
ok(race.status === 409, '  code 409, not 500', String(race.status))

const cInst = await call('POST', '/contracts', { token: buyerToken, body: { product_id: pInst.product.id } })
ok(cInst.success === true, 'POST /contracts — installment', cInst.error)
ok(cInst.schedule?.length === 6, '  schedule of 6 payments', String(cInst.schedule?.length))

const schedSum = cInst.schedule?.reduce((s, p) => s + Number(p.amount_tiyin), 0)
ok(schedSum === 60000000, '  schedule total equals the price down to the tiyin', sum(schedSum))
ok(cInst.contract?.animal_id === null, '  animal_id empty until shipment')

const balAfterInst = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)
ok(balAfterInst === balAfter, '  signing an instalment plan charges nothing', sum(balAfterInst))

const cFixLow = await call('POST', '/contracts', {
  token: buyerToken, body: { product_id: pFix.product.id, amount_tiyin: 1000 },
})
ok(cFixLow.success === false, 'deposit below the minimum rejected', cFixLow.error)

const cFix = await call('POST', '/contracts', {
  token: buyerToken, body: { product_id: pFix.product.id, amount_tiyin: 200000000 },
})
ok(cFix.success === true, 'POST /contracts — fixed_income', cFix.error)
ok(Number(cFix.contract?.principal_tiyin) === 200000000, '  deposit principal 2 million sum')
ok(cFix.contract?.annual_rate_bp === 1800, '  18% rate carried over from the offer')

const mine = await call('GET', '/contracts', { token: buyerToken })
ok(mine.contracts?.length >= 3, 'GET /contracts — my contracts', String(mine.contracts?.length))
ok(mine.contracts?.every(c => c.summary), '  every one has a summary')

const one = await call('GET', `/contracts/${cInst.contract.id}`, { token: buyerToken })
ok(one.schedule?.length === 6, 'GET /contracts/:id — schedule is nested')
ok(one.summary?.total === 60000000, '  summary.total matches the price')

const foreign = await call('GET', `/contracts/${cInst.contract.id}`, { token: sign({ id: 999999, phone: 'x', role: 'user' }) })
ok(foreign.status === 403, "someone else's contract is not returned", String(foreign.status))

const adminList = await call('GET', '/admin/contracts?model_type=installment', { token: adminToken })
ok(adminList.contracts?.every(c => c.model_type === 'installment'), 'GET /admin/contracts filters by model')
ok(adminList.contracts?.[0]?.user_phone !== undefined, '  and returns the client phone')

// ── payments ──────────────────────────────────────────────
console.log('\n── payments ──')

const sched = await call('GET', `/payments/schedule/${cInst.contract.id}`, { token: buyerToken })
ok(sched.schedule?.length === 6, 'GET /payments/schedule/:contractId')
ok(sched.summary?.remaining === 60000000, '  remaining to pay equals the price', sum(sched.summary?.remaining))

const balBeforePay = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)
const pay1 = await call('POST', '/payments/pay', { token: buyerToken, body: { contract_id: cInst.contract.id } })
ok(pay1.success === true, 'POST /payments/pay — first instalment', pay1.error)
ok(pay1.payment?.seq === 1, '  instalment #1 paid')
ok(pay1.remaining_payments === 5, '  5 left', String(pay1.remaining_payments))

const balAfterPay = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)
ok(balBeforePay - balAfterPay === Number(pay1.payment.amount_tiyin), 'charged exactly what the schedule says', sum(balBeforePay - balAfterPay))

const payAgain = await call('POST', '/payments/pay', { token: buyerToken, body: { contract_id: cInst.contract.id, schedule_id: pay1.payment.id } })
ok(payAgain.success === false, 'paying the same instalment twice is rejected', payAgain.error)

const waive = await call('POST', `/admin/payments/${sched.schedule[1].id}/waive`, { token: adminToken })
ok(waive.success === true, 'POST /admin/payments/:id/waive', waive.error)
ok(waive.payment?.status === 'waived', '  status waived')

const wrongModel = await call('POST', '/payments/pay', { token: buyerToken, body: { contract_id: cFix.contract.id } })
ok(wrongModel.success === false, 'payment on fixed_income rejected', wrongModel.error)

// ── money adds up ─────────────────────────────────────────
console.log('\n── money ──')

const txSum = Number((await pool.query(
  `SELECT COALESCE(sum(amount_tiyin),0) AS s FROM transactions WHERE user_id=$1`, [buyer.id]
)).rows[0].s)
const walletNow = Number((await pool.query(
  `SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id]
)).rows[0].balance_tiyin)
const spent = 5000000000 - walletNow
ok(spent === -txSum, 'transaction total matches the charges', `spent ${sum(spent)}, transactions ${sum(-txSum)}`)

// ── admin changes a password ──────────────────────────────
console.log('\n── admin changes a user password ──')

const hashBefore = (await pool.query(`SELECT password_hash FROM users WHERE id=$1`, [buyer.id])).rows[0]?.password_hash

const tooShort = await call('PUT', `/admin/users/${buyer.id}`, { token: adminToken, body: { password: 'abc' } })
ok(tooShort.success === false, 'short password rejected', tooShort.error)

const newPass = 'e2e-' + Date.now().toString(36)
const changed = await call('PUT', `/admin/users/${buyer.id}`, { token: adminToken, body: { password: newPass } })
ok(changed.success === true, 'PUT /admin/users/:id changes the password', changed.error)

const hashAfter = (await pool.query(`SELECT password_hash FROM users WHERE id=$1`, [buyer.id])).rows[0]?.password_hash
ok(hashAfter && hashAfter !== hashBefore, '  the hash in the database changed')
ok(hashAfter?.startsWith('$2'), '  and it is bcrypt, not plain text', hashAfter?.slice(0, 4))

const login = await call('POST', '/auth/login', { body: { phone: buyerPhone, password: newPass } })
ok(login.token !== undefined, '  the new password works for sign-in', login.error)

const noPass = await call('PUT', `/admin/users/${buyer.id}`, { token: adminToken, body: { name: 'E2E Test' } })
const hashKept = (await pool.query(`SELECT password_hash FROM users WHERE id=$1`, [buyer.id])).rows[0]?.password_hash
ok(noPass.success === true && hashKept === hashAfter, 'an edit without a password does not reset it')

// ── hiding a model ────────────────────────────────────────
console.log('\n── models_enabled ──')

const models = await call('GET', '/models')
ok(models.models?.includes('installment'), 'GET /models returns the enabled models', models.models?.join(', '))

await call('PUT', '/admin/settings', { token: adminToken, body: { models_enabled: 'ownership,fixed_income' } })

const hidden = await call('GET', '/models')
ok(!hidden.models?.includes('installment'), 'after being switched off, installment is gone from /models', hidden.models?.join(', '))

const listHidden = await call('GET', '/products')
ok(!listHidden.products?.some(p => p.model_type === 'installment'), 'a hidden model does not reach the catalogue')

const askHidden = await call('GET', '/products?model=installment')
ok(askHidden.products?.length === 0, 'a direct filter on a hidden model returns nothing')

const directHidden = await call('GET', `/products/${pInst.product.id}`)
ok(directHidden.status === 404, 'a direct link to a hidden offer — 404', String(directHidden.status))

const buyHidden = await call('POST', '/contracts', { token: buyerToken, body: { product_id: pInstFree.product.id } })
ok(buyHidden.error === 'model_disabled', 'a hidden model cannot be bought', buyHidden.error)

const createHidden = await call('POST', '/admin/products', {
  token: adminToken,
  body: { model_type: 'installment', title_en: 'E2E blocked', price_tiyin: 1, term_months: 3, meat_weight_g: 1, status: 'active' },
})
ok(createHidden.success === false, 'an offer of a hidden model cannot be created', createHidden.error)

const badSetting = await call('PUT', '/admin/settings', { token: adminToken, body: { models_enabled: 'ownership,horses' } })
ok(badSetting.success === false, 'junk in models_enabled rejected', badSetting.error)

const badFee = await call('PUT', '/admin/settings', { token: adminToken, body: { platform_fee_bp: 20000 } })
ok(badFee.success === false, 'a fee above 100% rejected', badFee.error)

// Contracts already signed on a hidden model keep working
const stillMine = await call('GET', '/contracts', { token: buyerToken })
ok(stillMine.contracts?.some(c => c.model_type === 'installment'),
   'an instalment contract already signed stays available to its owner')

await restoreModels()
const restored = (await pool.query(`SELECT value FROM settings WHERE key='models_enabled'`)).rows[0]?.value
ok(restored === savedModels, 'the setting was restored as it was', restored)

// ── summary ───────────────────────────────────────────────
console.log(`\n${passed} ok, ${failed} failed`)
console.log(`\nTest traces (user ${buyerPhone}, offers "E2E …", animal #${animal.id})`)
console.log('are cleaned up on the next run. To remove them for good:')
console.log(`  psql -U postgres -d molfi -c "`)
console.log(`    UPDATE animals SET status='active' WHERE id=${animal.id};`)
console.log(`    DELETE FROM transactions WHERE user_id=${buyer.id};`)
console.log(`    DELETE FROM contracts WHERE user_id=${buyer.id};`)
console.log(`    DELETE FROM products WHERE title_en LIKE 'E2E %';`)
console.log(`    DELETE FROM users WHERE id=${buyer.id};"`)

process.exit(failed ? 1 : 0)
