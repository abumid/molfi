// Stage 4 cron jobs. No server needed — this works against the database directly.
//
// The main thing checked here is idempotent accrual. The cron crashes and
// restarts — interest must not be accrued twice.

import 'dotenv/config'
import { pool } from '../src/db/pool.js'
import { accrueInterest } from '../src/jobs/accrueInterest.js'
import { markOverdue } from '../src/jobs/markOverdue.js'
import { buildSchedule } from '../src/utils/calculations.js'

let passed = 0, failed = 0
const ok = (cond, label, extra = '') => {
  cond ? passed++ : failed++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? '  → ' + extra : ''}`)
}
const sum = (t) => (t / 100).toLocaleString('en-US') + ' sum'
const quiet = () => {}

const PHONE = '+998900000888'

// ── setup ─────────────────────────────────────────────────

const cleanup = async () => {
  const u = (await pool.query(`SELECT id FROM users WHERE phone=$1`, [PHONE])).rows[0]
  if (u) {
    await pool.query(`DELETE FROM transactions WHERE user_id=$1`, [u.id])
    await pool.query(`DELETE FROM contracts WHERE user_id=$1`, [u.id])
  }
  await pool.query(`DELETE FROM products WHERE title_en LIKE 'JOBS %'`)
  return u
}

let user = await cleanup()
if (!user) {
  user = (await pool.query(
    `INSERT INTO users (phone, name, role, referral_code) VALUES ($1,'Jobs Test','user',$2) RETURNING id`,
    [PHONE, 'JOBS' + Date.now().toString(36).slice(-5).toUpperCase()]
  )).rows[0]
}
await pool.query(
  `INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1, 0)
   ON CONFLICT (user_id) DO UPDATE SET balance_tiyin = 0`,
  [user.id]
)
const farm = (await pool.query(`SELECT id FROM farms ORDER BY id LIMIT 1`)).rows[0]

// A 2 million sum deposit at 18% for 12 months, started 3 months ago
const pFix = (await pool.query(
  `INSERT INTO products (model_type, farm_id, title_en, min_amount_tiyin, term_months, annual_rate_bp, status)
   VALUES ('fixed_income',$1,'JOBS fixed income',100000000,12,1800,'active') RETURNING id`,
  [farm?.id || null]
)).rows[0]

const cFix = (await pool.query(
  `INSERT INTO contracts (user_id, product_id, model_type, status, principal_tiyin,
                          term_months, annual_rate_bp, starts_at, matures_at)
   VALUES ($1,$2,'fixed_income','active',200000000,12,1800,
           CURRENT_DATE - INTERVAL '3 months', CURRENT_DATE + INTERVAL '9 months')
   RETURNING *`,
  [user.id, pFix.id]
)).rows[0]

console.log(`user #${user.id}, deposit #${cFix.id}: 2 million sum at 18%, started 3 months ago\n`)

// ── accrueInterest ────────────────────────────────────────
console.log('── accrueInterest ──')

const run1 = await accrueInterest({ log: quiet })
const rows1 = (await pool.query(
  `SELECT * FROM payouts WHERE contract_id=$1 AND kind='interest' ORDER BY period_start`,
  [cFix.id]
)).rows

ok(rows1.length === 3, 'accrued for the 3 elapsed months', String(rows1.length))
ok(rows1.every(r => Number(r.amount_tiyin) === 3000000),
   'each accrual is 30,000 sum', rows1[0] && sum(rows1[0].amount_tiyin))
ok(rows1.every(r => r.status === 'pending'), 'status pending — accrued but not paid out')
ok(rows1.every(r => r.period_start && r.period_end), 'the period is set on every one')

const starts = rows1.map(r => r.period_start.toISOString().slice(0, 10))
ok(new Set(starts).size === 3, 'the periods do not repeat', starts.join(', '))

// A second run — the very thing the unique index exists for
const run2 = await accrueInterest({ log: quiet })
const rows2 = (await pool.query(
  `SELECT count(*)::int AS n, COALESCE(sum(amount_tiyin),0)::bigint AS s
   FROM payouts WHERE contract_id=$1 AND kind='interest'`,
  [cFix.id]
)).rows[0]

ok(Number(rows2.n) === 3, 'the second run added no rows', `was 3, now ${rows2.n}`)
ok(run2.created === 0, '  0 created')
ok(run2.skipped === 3, '  3 skipped as already accrued', String(run2.skipped))
ok(Number(rows2.s) === 9000000, '90,000 sum accrued over 3 months in total', sum(Number(rows2.s)))

// A third run in a row — just in case
await accrueInterest({ log: quiet })
const n3 = (await pool.query(
  `SELECT count(*)::int AS n FROM payouts WHERE contract_id=$1 AND kind='interest'`, [cFix.id]
)).rows[0].n
ok(Number(n3) === 3, 'the third run added nothing either', String(n3))

// A completed contract accrues nothing
await pool.query(`UPDATE contracts SET status='completed' WHERE id=$1`, [cFix.id])
const run4 = await accrueInterest({ log: quiet })
ok(run4.created === 0, 'no accrual on a completed contract')
await pool.query(`UPDATE contracts SET status='active' WHERE id=$1`, [cFix.id])

// ── markOverdue ───────────────────────────────────────────
console.log('\n── markOverdue ──')

const grace = Number((await pool.query(`SELECT value FROM settings WHERE key='overdue_grace_days'`)).rows[0]?.value || 5)
const maxMissed = Number((await pool.query(`SELECT value FROM settings WHERE key='default_after_missed'`)).rows[0]?.value || 3)

const pInst = (await pool.query(
  `INSERT INTO products (model_type, farm_id, title_en, price_tiyin, term_months, meat_weight_g, status)
   VALUES ('installment',$1,'JOBS installment',60000000,6,25000,'active') RETURNING id`,
  [farm?.id || null]
)).rows[0]

const cInst = (await pool.query(
  `INSERT INTO contracts (user_id, product_id, model_type, status, principal_tiyin, term_months, starts_at)
   VALUES ($1,$2,'installment','active',60000000,6, CURRENT_DATE - INTERVAL '7 months') RETURNING *`,
  [user.id, pInst.id]
)).rows[0]

// Two payments are long overdue, one is overdue but still in the grace period
const sched = buildSchedule(60000000, 6)
for (const [i, p] of sched.entries()) {
  const daysAgo = i < 2 ? grace + 10 : (i === 2 ? Math.max(0, grace - 2) : -30)
  await pool.query(
    `INSERT INTO payment_schedule (contract_id, seq, due_date, amount_tiyin)
     VALUES ($1,$2, CURRENT_DATE - ($3 || ' days')::interval, $4)`,
    [cInst.id, p.seq, String(daysAgo), p.amount_tiyin]
  )
}

const mo1 = await markOverdue({ log: quiet })
const st1 = (await pool.query(
  `SELECT status, count(*)::int n FROM payment_schedule WHERE contract_id=$1 GROUP BY status ORDER BY status`,
  [cInst.id]
)).rows

ok(mo1.overdue >= 2, 'overdue payments are marked', `${mo1.overdue} of them`)
const overdueCount = st1.find(r => r.status === 'overdue')?.n || 0
ok(overdueCount === 2, 'exactly 2 — the one in the grace period is untouched', String(overdueCount))

const cAfter1 = (await pool.query(`SELECT status FROM contracts WHERE id=$1`, [cInst.id])).rows[0]
ok(cAfter1.status === 'active', `with 2 of ${maxMissed} missed the contract is still active`, cAfter1.status)

// Catch up to the threshold
await pool.query(
  `UPDATE payment_schedule SET due_date = CURRENT_DATE - ($2 || ' days')::interval
   WHERE contract_id=$1 AND status='pending'`,
  [cInst.id, String(grace + 20)]
)
const mo2 = await markOverdue({ log: quiet })
const cAfter2 = (await pool.query(`SELECT status FROM contracts WHERE id=$1`, [cInst.id])).rows[0]
ok(cAfter2.status === 'defaulted', `with ${maxMissed}+ missed the contract went defaulted`, cAfter2.status)

// A repeat run breaks nothing
const mo3 = await markOverdue({ log: quiet })
ok(mo3.overdue === 0, 'the repeat run found no new overdue payments', String(mo3.overdue))
ok(mo3.defaulted === 0, '  and touched no contracts')

// waived does not turn into overdue
await pool.query(
  `UPDATE payment_schedule SET status='waived' WHERE contract_id=$1 AND seq=6`, [cInst.id]
)
await pool.query(
  `UPDATE payment_schedule SET due_date = CURRENT_DATE - ($2 || ' days')::interval WHERE contract_id=$1 AND seq=6`,
  [cInst.id, String(grace + 30)]
)
await markOverdue({ log: quiet })
const waived = (await pool.query(
  `SELECT status FROM payment_schedule WHERE contract_id=$1 AND seq=6`, [cInst.id]
)).rows[0]
ok(waived.status === 'waived', 'a waived payment does not become overdue', waived.status)

// ── summary ───────────────────────────────────────────────
console.log(`\n${passed} ok, ${failed} failed`)
console.log(`\nTest traces are cleaned up on the next run. To remove them for good:`)
console.log(`  psql -U postgres -d molfi -c "`)
console.log(`    DELETE FROM transactions WHERE user_id=${user.id};`)
console.log(`    DELETE FROM contracts WHERE user_id=${user.id};`)
console.log(`    DELETE FROM products WHERE title_en LIKE 'JOBS %';`)
console.log(`    DELETE FROM users WHERE id=${user.id};"`)

process.exit(failed ? 1 : 0)
