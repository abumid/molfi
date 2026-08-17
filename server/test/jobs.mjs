// Проверка крон-задач этапа 4. Сервер не нужен — работаем напрямую с базой.
//
// Главное, что здесь проверяется: идемпотентность начисления. Крон падает
// и перезапускается — проценты не должны начислиться дважды.

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
const sum = (t) => (t / 100).toLocaleString('ru-RU') + ' сум'
const quiet = () => {}

const PHONE = '+998900000888'

// ── подготовка ────────────────────────────────────────────

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

// Вклад 2 млн сум под 18% на 12 месяцев, начатый 3 месяца назад
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

console.log(`пользователь #${user.id}, вклад #${cFix.id}: 2 млн сум под 18%, начат 3 месяца назад\n`)

// ── accrueInterest ────────────────────────────────────────
console.log('── accrueInterest ──')

const run1 = await accrueInterest({ log: quiet })
const rows1 = (await pool.query(
  `SELECT * FROM payouts WHERE contract_id=$1 AND kind='interest' ORDER BY period_start`,
  [cFix.id]
)).rows

ok(rows1.length === 3, 'начислено за 3 прошедших месяца', String(rows1.length))
ok(rows1.every(r => Number(r.amount_tiyin) === 3000000),
   'каждое начисление 30 000 сум', rows1[0] && sum(rows1[0].amount_tiyin))
ok(rows1.every(r => r.status === 'pending'), 'статус pending — начислено, но не выплачено')
ok(rows1.every(r => r.period_start && r.period_end), 'период проставлен у каждого')

const starts = rows1.map(r => r.period_start.toISOString().slice(0, 10))
ok(new Set(starts).size === 3, 'периоды не повторяются', starts.join(', '))

// Повторный прогон — то, ради чего существует уникальный индекс
const run2 = await accrueInterest({ log: quiet })
const rows2 = (await pool.query(
  `SELECT count(*)::int AS n, COALESCE(sum(amount_tiyin),0)::bigint AS s
   FROM payouts WHERE contract_id=$1 AND kind='interest'`,
  [cFix.id]
)).rows[0]

ok(Number(rows2.n) === 3, 'повторный прогон не добавил записей', `было 3, стало ${rows2.n}`)
ok(run2.created === 0, '  создано 0')
ok(run2.skipped === 3, '  пропущено 3 как уже начисленные', String(run2.skipped))
ok(Number(rows2.s) === 9000000, 'итого начислено 90 000 сум за 3 месяца', sum(Number(rows2.s)))

// Третий прогон подряд — на всякий случай
await accrueInterest({ log: quiet })
const n3 = (await pool.query(
  `SELECT count(*)::int AS n FROM payouts WHERE contract_id=$1 AND kind='interest'`, [cFix.id]
)).rows[0].n
ok(Number(n3) === 3, 'третий прогон тоже ничего не добавил', String(n3))

// Завершённый договор не начисляет
await pool.query(`UPDATE contracts SET status='completed' WHERE id=$1`, [cFix.id])
const run4 = await accrueInterest({ log: quiet })
ok(run4.created === 0, 'по завершённому договору начислений нет')
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

// Два платежа давно просрочены, один просрочен, но ещё в льготном периоде
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

ok(mo1.overdue >= 2, 'просроченные платежи помечены', `${mo1.overdue} шт.`)
const overdueCount = st1.find(r => r.status === 'overdue')?.n || 0
ok(overdueCount === 2, 'ровно 2 — платёж в льготном периоде не тронут', String(overdueCount))

const cAfter1 = (await pool.query(`SELECT status FROM contracts WHERE id=$1`, [cInst.id])).rows[0]
ok(cAfter1.status === 'active', `при 2 просрочках из ${maxMissed} договор ещё активен`, cAfter1.status)

// Догоняем порог
await pool.query(
  `UPDATE payment_schedule SET due_date = CURRENT_DATE - ($2 || ' days')::interval
   WHERE contract_id=$1 AND status='pending'`,
  [cInst.id, String(grace + 20)]
)
const mo2 = await markOverdue({ log: quiet })
const cAfter2 = (await pool.query(`SELECT status FROM contracts WHERE id=$1`, [cInst.id])).rows[0]
ok(cAfter2.status === 'defaulted', `при ${maxMissed}+ просрочках договор ушёл в defaulted`, cAfter2.status)

// Повторный прогон ничего не ломает
const mo3 = await markOverdue({ log: quiet })
ok(mo3.overdue === 0, 'повторный прогон новых просрочек не нашёл', String(mo3.overdue))
ok(mo3.defaulted === 0, '  и договоров не тронул')

// waived не превращается в overdue
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
ok(waived.status === 'waived', 'прощённый платёж не становится просроченным', waived.status)

// ── итог ──────────────────────────────────────────────────
console.log(`\n${passed} ok, ${failed} failed`)
console.log(`\nСледы теста убираются при следующем прогоне. Убрать совсем:`)
console.log(`  psql -U postgres -d molfi -c "`)
console.log(`    DELETE FROM transactions WHERE user_id=${user.id};`)
console.log(`    DELETE FROM contracts WHERE user_id=${user.id};`)
console.log(`    DELETE FROM products WHERE title_en LIKE 'JOBS %';`)
console.log(`    DELETE FROM users WHERE id=${user.id};"`)

process.exit(failed ? 1 : 0)
