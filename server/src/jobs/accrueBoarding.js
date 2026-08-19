// Boarding fee accrual.
//
// Replaces the old accrueInterest: there is no fixed-rate model here, so there
// is no interest to accrue. There is a care fee instead, and it accrues monthly
// on every live contract that has an animal.
//
// What happens to the accrued amount:
//   investment — builds up as debt, settled out of the sale proceeds
//   ownership  — builds up as debt, the client pays it off via /payments
//
// Idempotency rests on boarding_accrued_until: the job counts only whole
// months elapsed since that date and then moves it forward. Running it again
// on the same day adds zero months.

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

  log(`[accrueBoarding] contracts ${contracts.length}, accrued on ${touched} for ${months} mo., total ${totalTiyin} tiyin`)
  return { contracts: contracts.length, touched, months, totalTiyin }
}

// Manual run: npm run job:boarding
if (import.meta.url === `file://${process.argv[1]}`) {
  await accrueBoarding()
  process.exit(0)
}
