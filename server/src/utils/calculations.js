// Molfi v2 — расчёты по трём моделям.
// Заменяет calculations.legacy.js (расчёт доли).
//
// Правила:
//   • все деньги — целые тийины (BIGINT в БД), 1 сум = 100 тийин
//   • все ставки — базисные пункты: 1800 = 18%
//   • округление — только Math.round на границе, промежуточных дробей не храним
//   • комиссия платформы берётся из settings.platform_fee_bp, не из константы

const BP = 10000 // 100% в базисных пунктах

// ─────────────────────────────────────────────────────────────
// OWNERSHIP — полное владение животным
// ─────────────────────────────────────────────────────────────

/** Прогноз выручки при продаже по текущему весу (до комиссии). */
export const projectGross = (animal) => {
  const weightKg = (animal.current_weight_g || 0) / 1000
  const pricePerKg = Number(animal.price_per_kg_tiyin) || 0
  return Math.round(weightKg * pricePerKg)
}

/**
 * Сколько владелец получит на руки после продажи.
 * Комиссия берётся только с прибыли, а не со всей выручки — иначе
 * при падении цены владелец платит комиссию за собственный убыток.
 */
export const ownershipPayout = (contract, animal, platformFeeBp) => {
  const gross = Number(animal.final_sale_price_tiyin) || projectGross(animal)
  const principal = Number(contract.principal_tiyin) || 0
  const profit = Math.max(0, gross - principal)
  const fee = Math.round(profit * platformFeeBp / BP)
  return { gross, profit, fee, net: gross - fee }
}

/** Плата за содержание за прошедшие месяцы. */
export const boardingFeeDue = (contract, monthlyFeeTiyin, asOf = new Date()) => {
  const months = monthsBetween(new Date(contract.starts_at), asOf)
  return Math.round(months * (Number(monthlyFeeTiyin) || 0))
}

// ─────────────────────────────────────────────────────────────
// INSTALLMENT — мясо наперёд / рассрочка
// ─────────────────────────────────────────────────────────────

/**
 * График платежей. Остаток от деления кидаем в первый платёж,
 * чтобы сумма графика ровно сошлась с ценой — иначе на 12 месяцах
 * теряется до 11 тийин и договор никогда не закроется.
 */
export const buildSchedule = (totalTiyin, months, startDate = new Date()) => {
  const total = Number(totalTiyin) || 0
  const base = Math.floor(total / months)
  const remainder = total - base * months

  return Array.from({ length: months }, (_, i) => {
    const due = new Date(startDate)
    due.setMonth(due.getMonth() + i + 1)
    return {
      seq: i + 1,
      due_date: due.toISOString().slice(0, 10),
      amount_tiyin: i === 0 ? base + remainder : base,
      status: 'pending',
    }
  })
}

/** Сводка по договору рассрочки. */
export const installmentSummary = (contract, schedule, asOf = new Date()) => {
  const total = Number(contract.principal_tiyin) || 0
  const paid = schedule.reduce((s, p) => s + Number(p.paid_tiyin || 0), 0)
  const overdue = schedule.filter(
    p => p.status !== 'paid' && new Date(p.due_date) < asOf
  )
  const next = schedule.find(p => p.status === 'pending')

  return {
    total,
    paid,
    remaining: total - paid,
    progressPct: total ? Math.round(paid / total * 100) : 0,
    overdueCount: overdue.length,
    overdueTiyin: overdue.reduce(
      (s, p) => s + (Number(p.amount_tiyin) - Number(p.paid_tiyin || 0)), 0
    ),
    nextDueDate: next?.due_date ?? null,
    nextAmountTiyin: next ? Number(next.amount_tiyin) - Number(next.paid_tiyin || 0) : 0,
    isComplete: paid >= total,
  }
}

/** Пеня за просрочку. late_fee_bp — за каждый день. */
export const lateFee = (installment, lateFeeBp, asOf = new Date()) => {
  if (!lateFeeBp) return 0
  const days = Math.max(0, daysBetween(new Date(installment.due_date), asOf))
  const unpaid = Number(installment.amount_tiyin) - Number(installment.paid_tiyin || 0)
  return Math.round(unpaid * lateFeeBp / BP * days)
}

// ─────────────────────────────────────────────────────────────
// FIXED_INCOME — фиксированный доход
// ─────────────────────────────────────────────────────────────

/**
 * Начисление за период. Простой процент, не сложный:
 * ферма платит с тела вклада, проценты не капитализируются.
 */
export const accrueInterest = (principalTiyin, annualRateBp, days) => {
  const principal = Number(principalTiyin) || 0
  return Math.round(principal * (annualRateBp / BP) * (days / 365))
}

/** Ежемесячное начисление — то, что кладём в payouts kind='interest'. */
export const monthlyInterest = (contract) =>
  accrueInterest(contract.principal_tiyin, contract.annual_rate_bp, 365 / 12)

/** Итог на дату погашения: тело + все проценты за срок. */
export const fixedIncomeMaturity = (contract) => {
  const principal = Number(contract.principal_tiyin) || 0
  const months = Number(contract.term_months) || 0
  const interest = accrueInterest(principal, contract.annual_rate_bp, months * 365 / 12)
  return { principal, interest, total: principal + interest }
}

// ─────────────────────────────────────────────────────────────
// Общее
// ─────────────────────────────────────────────────────────────

/** Роутер расчёта — по типу модели договора. */
export const contractSummary = (contract, ctx = {}) => {
  switch (contract.model_type) {
    case 'ownership':
      return ownershipPayout(contract, ctx.animal || {}, ctx.platformFeeBp ?? 1000)
    case 'installment':
      return installmentSummary(contract, ctx.schedule || [])
    case 'fixed_income':
      return fixedIncomeMaturity(contract)
    default:
      throw new Error(`Unknown model_type: ${contract.model_type}`)
  }
}

const daysBetween = (a, b) => Math.floor((b - a) / 86400000)

const monthsBetween = (a, b) =>
  (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
