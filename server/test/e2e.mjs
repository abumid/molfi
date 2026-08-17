// Сквозная проверка этапа 3: products / contracts / payments.
// Требует запущенного сервера (npm run dev в соседней вкладке).
//
// Токены подписываем сами через JWT_SECRET — так не нужен пароль админа,
// и тест не зависит от того, кто как заводил учётки.

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
  try { json = await res.json() } catch { /* пустое тело */ }
  return { status: res.status, ...json }
}

const sign = (u) => jwt.sign({ id: u.id, phone: u.phone, role: u.role }, process.env.JWT_SECRET, { expiresIn: '1h' })

const sum = (t) => (t / 100).toLocaleString('ru-RU') + ' сум'

// ── подготовка ────────────────────────────────────────────

const admin = (await pool.query(`SELECT id, phone, role FROM users WHERE role='admin' LIMIT 1`)).rows[0]
if (!admin) {
  console.error('Нет ни одного пользователя с role=admin. Назначьте админа и повторите:')
  console.error(`  psql -U postgres -d molfi -c "UPDATE users SET role='admin' WHERE id=1"`)
  process.exit(1)
}
const adminToken = sign(admin)

// Отдельный покупатель — чтобы не портить реальные учётки
const buyerPhone = '+998900000777'

// Уборка следов прошлого прогона: иначе каждый запуск съедает животное
// и оставляет висеть офферы. Трогаем только то, что создал сам тест.
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
    `INSERT INTO users (phone, name, role, referral_code) VALUES ($1,'E2E Тест','user',$2) RETURNING id, phone, role`,
    [buyerPhone, 'E2E' + Date.now().toString(36).toUpperCase().slice(-5)]
  )).rows[0]
}
const buyerToken = sign(buyer)

// Кошелёк на 50 млн сум
await pool.query(
  `INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1, 5000000000)
   ON CONFLICT (user_id) DO UPDATE SET balance_tiyin = 5000000000`,
  [buyer.id]
)

// Свободное животное под ownership
const animal = (await pool.query(
  `SELECT id, name FROM animals
   WHERE status = 'active'
     AND id NOT IN (SELECT animal_id FROM contracts WHERE animal_id IS NOT NULL AND model_type='ownership' AND status IN ('pending','active'))
   ORDER BY id LIMIT 1`
)).rows[0]
if (!animal) { console.error('Нет свободного животного со статусом active'); process.exit(1) }

const farm = (await pool.query(`SELECT id FROM farms ORDER BY id LIMIT 1`)).rows[0]

console.log(`админ #${admin.id}, покупатель #${buyer.id}, животное #${animal.id} «${animal.name}»`)

// Рассрочка сейчас спрятана через settings.models_enabled. Код при этом
// живой, и оставлять его без проверок нельзя — спящий непроверяемый код
// протухает. На время прогона включаем все модели, в конце возвращаем.
const savedModels = (await pool.query(`SELECT value FROM settings WHERE key='models_enabled'`)).rows[0]?.value
  ?? 'ownership,fixed_income'
await call('PUT', '/admin/settings', { token: adminToken, body: { models_enabled: 'ownership,installment,fixed_income' } })
console.log(`модели на время теста: все три (в базе ${savedModels})\n`)

const restoreModels = async () => {
  await call('PUT', '/admin/settings', { token: adminToken, body: { models_enabled: savedModels } })
}
process.on('exit', () => { /* восстановление ниже, синхронно уже нельзя */ })

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

// Запасной оффер рассрочки: его никто не купит, он понадобится в самом
// конце, чтобы проверить блокировку по модели на активном оффере.
// На раскупленном сработает более ранняя проверка статуса.
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
ok(bad.success === false, 'installment без term_months отклонён', bad.error)

const noAuth = await call('POST', '/admin/products', { body: { model_type: 'ownership' } })
ok(noAuth.status === 401, 'без токена — 401', String(noAuth.status))

const asUser = await call('POST', '/admin/products', { token: buyerToken, body: { model_type: 'ownership' } })
ok(asUser.status === 403, 'обычным пользователем — 403', String(asUser.status))

const list = await call('GET', '/products')
ok(Array.isArray(list.products), 'GET /products')

const filtered = await call('GET', '/products?model=fixed_income')
ok(filtered.products?.every(p => p.model_type === 'fixed_income'), 'GET /products?model=fixed_income фильтрует')

const detail = await call('GET', `/products/${pOwn.product.id}`)
ok(detail.product?.animal_name === animal.name, 'GET /products/:id отдаёт животное', detail.product?.animal_name)
ok(Array.isArray(detail.weights), '  и историю веса')

// ── contracts ─────────────────────────────────────────────
console.log('\n── contracts ──')

const balBefore = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)

const cOwn = await call('POST', '/contracts', {
  token: buyerToken,
  body: { product_id: pOwn.product.id, exit_type: 'slaughter' },
})
ok(cOwn.success === true, 'POST /contracts — ownership', cOwn.error)
ok(cOwn.contract?.animal_id === animal.id, '  животное привязано')
ok(cOwn.contract?.exit_type === 'slaughter', '  exit_type сохранён')

const balAfter = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)
ok(balBefore - balAfter === 65000000, 'с кошелька списана цена животного', sum(balBefore - balAfter))

const animalStatus = (await pool.query(`SELECT status FROM animals WHERE id=$1`, [animal.id])).rows[0].status
ok(animalStatus === 'owned', 'животное помечено owned', animalStatus)

// Слоты кончились — оффер сам ушёл в sold_out
const dup = await call('POST', '/contracts', { token: buyerToken, body: { product_id: pOwn.product.id } })
ok(dup.error === 'product_not_active' || dup.error === 'no_slots_left',
   'повторная покупка того же оффера отклонена', `${dup.status} ${dup.error}`)

// Гонка за животное. Второй оффер на то же самое животное — единственный
// способ дойти до уникального индекса: проверка слотов его не поймает.
// Ровно так и выглядит реальная ошибка админа, заведшего оффер дважды.
const pOwnDup = await call('POST', '/admin/products', {
  token: adminToken,
  body: {
    model_type: 'ownership', animal_id: animal.id, farm_id: farm?.id,
    title_en: 'E2E ownership duplicate', price_tiyin: 65000000, status: 'active',
  },
})
ok(pOwnDup.success === true, 'второй оффер на то же животное создан', pOwnDup.error)

const race = await call('POST', '/contracts', { token: buyerToken, body: { product_id: pOwnDup.product.id } })
ok(race.error === 'animal_already_sold', 'договор через второй оффер отклонён по 23505', `${race.status} ${race.error}`)
ok(race.status === 409, '  код 409, а не 500', String(race.status))

const cInst = await call('POST', '/contracts', { token: buyerToken, body: { product_id: pInst.product.id } })
ok(cInst.success === true, 'POST /contracts — installment', cInst.error)
ok(cInst.schedule?.length === 6, '  график на 6 платежей', String(cInst.schedule?.length))

const schedSum = cInst.schedule?.reduce((s, p) => s + Number(p.amount_tiyin), 0)
ok(schedSum === 60000000, '  сумма графика равна цене до тийина', sum(schedSum))
ok(cInst.contract?.animal_id === null, '  animal_id пустой до отгрузки')

const balAfterInst = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)
ok(balAfterInst === balAfter, '  при оформлении рассрочки списания нет', sum(balAfterInst))

const cFixLow = await call('POST', '/contracts', {
  token: buyerToken, body: { product_id: pFix.product.id, amount_tiyin: 1000 },
})
ok(cFixLow.success === false, 'вклад ниже минимума отклонён', cFixLow.error)

const cFix = await call('POST', '/contracts', {
  token: buyerToken, body: { product_id: pFix.product.id, amount_tiyin: 200000000 },
})
ok(cFix.success === true, 'POST /contracts — fixed_income', cFix.error)
ok(Number(cFix.contract?.principal_tiyin) === 200000000, '  тело вклада 2 млн сум')
ok(cFix.contract?.annual_rate_bp === 1800, '  ставка 18% перенесена из оффера')

const mine = await call('GET', '/contracts', { token: buyerToken })
ok(mine.contracts?.length >= 3, 'GET /contracts — мои договоры', String(mine.contracts?.length))
ok(mine.contracts?.every(c => c.summary), '  у каждого есть summary')

const one = await call('GET', `/contracts/${cInst.contract.id}`, { token: buyerToken })
ok(one.schedule?.length === 6, 'GET /contracts/:id — график вложен')
ok(one.summary?.total === 60000000, '  summary.total совпадает с ценой')

const foreign = await call('GET', `/contracts/${cInst.contract.id}`, { token: sign({ id: 999999, phone: 'x', role: 'user' }) })
ok(foreign.status === 403, 'чужой договор не отдаётся', String(foreign.status))

const adminList = await call('GET', '/admin/contracts?model_type=installment', { token: adminToken })
ok(adminList.contracts?.every(c => c.model_type === 'installment'), 'GET /admin/contracts фильтрует по модели')
ok(adminList.contracts?.[0]?.user_phone !== undefined, '  и отдаёт телефон клиента')

// ── payments ──────────────────────────────────────────────
console.log('\n── payments ──')

const sched = await call('GET', `/payments/schedule/${cInst.contract.id}`, { token: buyerToken })
ok(sched.schedule?.length === 6, 'GET /payments/schedule/:contractId')
ok(sched.summary?.remaining === 60000000, '  остаток к оплате равен цене', sum(sched.summary?.remaining))

const balBeforePay = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)
const pay1 = await call('POST', '/payments/pay', { token: buyerToken, body: { contract_id: cInst.contract.id } })
ok(pay1.success === true, 'POST /payments/pay — первый платёж', pay1.error)
ok(pay1.payment?.seq === 1, '  оплачен платёж №1')
ok(pay1.remaining_payments === 5, '  осталось 5', String(pay1.remaining_payments))

const balAfterPay = Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id])).rows[0].balance_tiyin)
ok(balBeforePay - balAfterPay === Number(pay1.payment.amount_tiyin), 'списано ровно столько, сколько в графике', sum(balBeforePay - balAfterPay))

const payAgain = await call('POST', '/payments/pay', { token: buyerToken, body: { contract_id: cInst.contract.id, schedule_id: pay1.payment.id } })
ok(payAgain.success === false, 'повторная оплата того же платежа отклонена', payAgain.error)

const waive = await call('POST', `/admin/payments/${sched.schedule[1].id}/waive`, { token: adminToken })
ok(waive.success === true, 'POST /admin/payments/:id/waive', waive.error)
ok(waive.payment?.status === 'waived', '  статус waived')

const wrongModel = await call('POST', '/payments/pay', { token: buyerToken, body: { contract_id: cFix.contract.id } })
ok(wrongModel.success === false, 'оплата по fixed_income отклонена', wrongModel.error)

// ── сходимость денег ──────────────────────────────────────
console.log('\n── деньги ──')

const txSum = Number((await pool.query(
  `SELECT COALESCE(sum(amount_tiyin),0) AS s FROM transactions WHERE user_id=$1`, [buyer.id]
)).rows[0].s)
const walletNow = Number((await pool.query(
  `SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [buyer.id]
)).rows[0].balance_tiyin)
const spent = 5000000000 - walletNow
ok(spent === -txSum, 'сумма транзакций сходится со списаниями', `потрачено ${sum(spent)}, транзакции ${sum(-txSum)}`)

// ── скрытие модели ────────────────────────────────────────
console.log('\n── models_enabled ──')

const models = await call('GET', '/models')
ok(models.models?.includes('installment'), 'GET /models отдаёт включённые модели', models.models?.join(', '))

await call('PUT', '/admin/settings', { token: adminToken, body: { models_enabled: 'ownership,fixed_income' } })

const hidden = await call('GET', '/models')
ok(!hidden.models?.includes('installment'), 'после выключения installment пропал из /models', hidden.models?.join(', '))

const listHidden = await call('GET', '/products')
ok(!listHidden.products?.some(p => p.model_type === 'installment'), 'скрытая модель не попадает в витрину')

const askHidden = await call('GET', '/products?model=installment')
ok(askHidden.products?.length === 0, 'прямой фильтр по скрытой модели отдаёт пусто')

const directHidden = await call('GET', `/products/${pInst.product.id}`)
ok(directHidden.status === 404, 'прямая ссылка на скрытый оффер — 404', String(directHidden.status))

const buyHidden = await call('POST', '/contracts', { token: buyerToken, body: { product_id: pInstFree.product.id } })
ok(buyHidden.error === 'model_disabled', 'оформить скрытую модель нельзя', buyHidden.error)

const createHidden = await call('POST', '/admin/products', {
  token: adminToken,
  body: { model_type: 'installment', title_en: 'E2E blocked', price_tiyin: 1, term_months: 3, meat_weight_g: 1, status: 'active' },
})
ok(createHidden.success === false, 'создать оффер скрытой модели нельзя', createHidden.error)

const badSetting = await call('PUT', '/admin/settings', { token: adminToken, body: { models_enabled: 'ownership,horses' } })
ok(badSetting.success === false, 'мусор в models_enabled отклонён', badSetting.error)

const badFee = await call('PUT', '/admin/settings', { token: adminToken, body: { platform_fee_bp: 20000 } })
ok(badFee.success === false, 'комиссия выше 100% отклонена', badFee.error)

// Существующие договоры по скрытой модели продолжают жить
const stillMine = await call('GET', '/contracts', { token: buyerToken })
ok(stillMine.contracts?.some(c => c.model_type === 'installment'),
   'уже оформленный договор рассрочки остаётся доступен владельцу')

await restoreModels()
const restored = (await pool.query(`SELECT value FROM settings WHERE key='models_enabled'`)).rows[0]?.value
ok(restored === savedModels, 'настройка возвращена как была', restored)

// ── итог ──────────────────────────────────────────────────
console.log(`\n${passed} ok, ${failed} failed`)
console.log(`\nСледы теста (пользователь ${buyerPhone}, офферы «E2E …», животное #${animal.id})`)
console.log('убираются автоматически при следующем прогоне. Убрать совсем:')
console.log(`  psql -U postgres -d molfi -c "`)
console.log(`    UPDATE animals SET status='active' WHERE id=${animal.id};`)
console.log(`    DELETE FROM transactions WHERE user_id=${buyer.id};`)
console.log(`    DELETE FROM contracts WHERE user_id=${buyer.id};`)
console.log(`    DELETE FROM products WHERE title_en LIKE 'E2E %';`)
console.log(`    DELETE FROM users WHERE id=${buyer.id};"`)

process.exit(failed ? 1 : 0)
