// Начисление абонплаты за содержание.
//
// Заменяет прежний accrueInterest: модели с фиксированной ставкой у нас нет,
// начислять проценты не с чего. Зато есть плата за уход, и она начисляется
// помесячно по всем живым договорам с животным.
//
// Что происходит с начисленным:
//   investment — копится долгом и гасится из выручки при продаже
//   ownership  — копится долгом, клиент гасит его через /payments
//
// Идемпотентность держится на boarding_accrued_until: задача считает
// только полные месяцы, прошедшие с этой даты, и двигает её вперёд.
// Повторный запуск в тот же день добавит ноль месяцев.

import 'dotenv/config'
import { pool } from '../db/pool.js'
import { monthsBetween, addMonths } from '../utils/calculations.js'

export const accrueBoarding = async ({ asOf = new Date(), log = console.log } = {}) => {
  const contracts = (await pool.query(
    `SELECT id, user_id, starts_at, boarding_accrued_until, boarding_fee_monthly_tiyin
     FROM contracts
     WHERE model_type IN ('investment','ownership')
       AND status = 'active'
       AND COALESCE(boarding_fee_monthly_tiyin, 0) > 0
     ORDER BY id`
  )).rows

  let touched = 0, months = 0, totalTiyin = 0

  for (const c of contracts) {
    const from = new Date(c.boarding_accrued_until || c.starts_at)
    if (Number.isNaN(from.getTime())) continue

    const due = Math.max(0, monthsBetween(from, asOf))
    if (due === 0) continue

    const amount = due * Number(c.boarding_fee_monthly_tiyin)
    const until = addMonths(from, due).toISOString().slice(0, 10)

    await pool.query(
      `UPDATE contracts
       SET boarding_accrued_tiyin = boarding_accrued_tiyin + $2,
           boarding_accrued_until = $3
       WHERE id = $1`,
      [c.id, amount, until]
    )

    touched++
    months += due
    totalTiyin += amount
  }

  log(`[accrueBoarding] договоров ${contracts.length}, начислено по ${touched} за ${months} мес., итого ${totalTiyin} тийин`)
  return { contracts: contracts.length, touched, months, totalTiyin }
}

// Ручной запуск: npm run job:boarding
if (import.meta.url === `file://${process.argv[1]}`) {
  await accrueBoarding()
  process.exit(0)
}
