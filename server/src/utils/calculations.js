// Molfi — math for the three ownership models.
//
//   investment  — the client buys an animal, the farm raises it, the client
//                 decides when to sell. Boarding fees accrue and are settled
//                 out of the sale proceeds. Income is a projection: weight ×
//                 price per kg. No promised rate — livestock cannot give one.
//
//   ownership   — the client buys an animal and pays boarding monthly, then
//                 takes it live or as meat. There is no cash payout.
//
//   installment — meat at a fixed price paid over N months.
//                 Currently switched off via settings.models_enabled.
//
// Rules:
//   • all money is whole tiyin, 1 sum = 100 tiyin
//   • all rates are basis points: 300 = 3%
//   • rounding happens only via Math.round at the boundary
//   • tariffs arrive as parameters from settings, never as constants

const BP = 10000 // 100% in basis points

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

const num = (v) => Number(v) || 0

export const daysBetween = (a, b) => Math.floor((b - a) / 86400000)

export const monthsBetween = (a, b) =>
  (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())

export const addMonths = (date, n) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

/** Purchase fee. Currently 0 — enabled through settings, not through code. */
export const purchaseFee = (priceTiyin, feeBp) =>
  Math.round(num(priceTiyin) * num(feeBp) / BP)

/** Full amount charged at checkout. */
export const purchaseTotal = (priceTiyin, feeBp) =>
  num(priceTiyin) + purchaseFee(priceTiyin, feeBp)

// ─────────────────────────────────────────────────────────────
// Boarding fee
// ─────────────────────────────────────────────────────────────

/**
 * How many months of boarding have accrued by a given date.
 * Only completed months count: an unfinished month is not billable yet.
 */
export const boardingMonthsDue = (startsAt, asOf = new Date()) => {
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return 0
  return Math.max(0, monthsBetween(start, asOf))
}

/** Boarding accrued over the whole holding period up to a date. */
export const boardingDue = (contract, asOf = new Date()) =>
  boardingMonthsDue(contract.starts_at, asOf) * num(contract.boarding_fee_monthly_tiyin)

/** Outstanding boarding balance. */
export const boardingOutstanding = (contract) =>
  Math.max(0, num(contract.boarding_accrued_tiyin) - num(contract.boarding_paid_tiyin))

// ─────────────────────────────────────────────────────────────
// INVESTMENT — bought in order to be sold
// ─────────────────────────────────────────────────────────────

/**
 * Projected sale revenue: current weight × price per kilogram.
 * This is an expectation, not a promise — both weight and price move.
 */
export const projectedRevenue = (animal) => {
  const kg = num(animal.current_weight_g) / 1000
  return Math.round(kg * num(animal.price_per_kg_tiyin))
}

/**
 * What the client receives if the animal is sold right now.
 *
 * The order of deductions matters: boarding debt is settled first, profit is
 * computed after that, and the fee is taken from profit only. A fee on gross
 * revenue would mean that when prices fall the client pays for their own loss.
 */
export const investmentPayout = (contract, animal, opts = {}) => {
  const {
    profitFeeClientBp = 0,
    profitFeeFarmBp = 0,
    salePriceTiyin = null,
    asOf = new Date(),
  } = opts

  const gross = salePriceTiyin != null ? num(salePriceTiyin) : projectedRevenue(animal)
  const principal = num(contract.principal_tiyin)

  // Boarding debt: either what has already been accrued, or computed from term
  const boarding = num(contract.boarding_accrued_tiyin) > 0
    ? boardingOutstanding(contract)
    : boardingDue(contract, asOf)

  // Signed result, for display. Deliberately separate from profit: profit is
  // clamped at zero for the fee math (you cannot charge a percentage of a
  // loss), and reusing it for display would turn a loss into "0" on screen —
  // the client sees a zero and cannot tell whether they lost anything.
  const pnl = gross - principal - boarding

  const profit = Math.max(0, pnl)
  const feeClient = Math.round(profit * num(profitFeeClientBp) / BP)
  const feeFarm = Math.round(profit * num(profitFeeFarmBp) / BP)

  // The client can never receive less than zero: if revenue did not even cover
  // boarding, the gap stays a debt rather than becoming a negative payout
  const net = Math.max(0, gross - boarding - feeClient)
  const shortfall = Math.max(0, boarding - Math.max(0, gross - feeClient))

  return {
    gross,
    principal,
    boarding,
    profit,
    pnl,
    fee_client: feeClient,
    fee_farm: feeFarm,
    net,
    shortfall,
    // Return relative to the amount invested, for display
    return_pct: principal ? (net - principal) / principal : 0,
  }
}

// ─────────────────────────────────────────────────────────────
// OWNERSHIP — bought for the meat
// ─────────────────────────────────────────────────────────────

/**
 * Summary for an ownership contract. There is no cash payout: the client takes
 * the animal or the meat, and only pays for boarding.
 */
export const ownershipSummary = (contract, asOf = new Date()) => {
  const months = boardingMonthsDue(contract.starts_at, asOf)
  const fee = num(contract.boarding_fee_monthly_tiyin)
  return {
    principal: num(contract.principal_tiyin),
    months,
    monthly_fee: fee,
    accrued: num(contract.boarding_accrued_tiyin),
    paid: num(contract.boarding_paid_tiyin),
    outstanding: boardingOutstanding(contract),
    total_cost: num(contract.principal_tiyin) + num(contract.boarding_accrued_tiyin),
  }
}

// ─────────────────────────────────────────────────────────────
// INSTALLMENT — payment by instalments
// ─────────────────────────────────────────────────────────────

/**
 * Payment schedule. The division remainder goes into the first instalment so
 * that the schedule adds up to the price down to the tiyin — otherwise up to
 * 11 tiyin are lost over 12 months and the contract can never close.
 */
export const buildSchedule = (totalTiyin, months, startDate = new Date()) => {
  const total = num(totalTiyin)
  const n = Number(months) || 0
  if (n <= 0) return []
  const base = Math.floor(total / n)
  const remainder = total - base * n

  return Array.from({ length: n }, (_, i) => {
    const due = addMonths(startDate, i + 1)
    return {
      seq: i + 1,
      due_date: due.toISOString().slice(0, 10),
      amount_tiyin: i === 0 ? base + remainder : base,
      status: 'pending',
    }
  })
}

export const installmentSummary = (contract, schedule, asOf = new Date()) => {
  const total = num(contract.principal_tiyin)
  const paid = schedule.reduce((s, p) => s + num(p.paid_tiyin), 0)
  const overdue = schedule.filter(p => p.status !== 'paid' && new Date(p.due_date) < asOf)
  const next = schedule.find(p => p.status === 'pending')

  return {
    total,
    paid,
    remaining: total - paid,
    progressPct: total ? Math.round(paid / total * 100) : 0,
    overdueCount: overdue.length,
    overdueTiyin: overdue.reduce((s, p) => s + (num(p.amount_tiyin) - num(p.paid_tiyin)), 0),
    nextDueDate: next?.due_date ?? null,
    nextAmountTiyin: next ? num(next.amount_tiyin) - num(next.paid_tiyin) : 0,
    isComplete: paid >= total,
  }
}

/** Late-payment penalty. lateFeeBp is charged per day overdue. */
export const lateFee = (installment, lateFeeBp, asOf = new Date()) => {
  if (!lateFeeBp) return 0
  const days = Math.max(0, daysBetween(new Date(installment.due_date), asOf))
  const unpaid = num(installment.amount_tiyin) - num(installment.paid_tiyin)
  return Math.round(unpaid * num(lateFeeBp) / BP * days)
}

// ─────────────────────────────────────────────────────────────
// Dispatch by model
// ─────────────────────────────────────────────────────────────

export const contractSummary = (contract, ctx = {}) => {
  switch (contract.model_type) {
    case 'investment':
      return investmentPayout(contract, ctx.animal || {}, ctx)
    case 'ownership':
      return ownershipSummary(contract, ctx.asOf)
    case 'installment':
      return installmentSummary(contract, ctx.schedule || [], ctx.asOf)
    default:
      throw new Error(`Unknown model_type: ${contract.model_type}`)
  }
}
