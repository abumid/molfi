// Molfi — расчёты по трём моделям.
//
//   investment  — клиент покупает животное, ферма его растит, клиент решает
//                 когда продать. Абонплата за содержание копится и гасится
//                 из выручки при продаже. Доход прогнозный: вес × цена за кг.
//                 Никаких обещанных процентов — животноводство их не даёт.
//
//   ownership   — клиент покупает животное и платит абонплату помесячно,
//                 в конце забирает его живым или мясом. Денежного возврата нет.
//
//   installment — мясо по фиксированной цене с оплатой за N месяцев.
//                 Пока выключена в settings.models_enabled.
//
// Правила:
//   • все деньги — целые тийины, 1 сум = 100 тийин
//   • все ставки — базисные пункты: 300 = 3%
//   • округление только Math.round на границе
//   • тарифы приходят параметрами из settings, не константами

const BP = 10000 // 100% в базисных пунктах

// ─────────────────────────────────────────────────────────────
// Общее
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

/** Комиссия при покупке. Сейчас 0 — включается настройкой, не кодом. */
export const purchaseFee = (priceTiyin, feeBp) =>
  Math.round(num(priceTiyin) * num(feeBp) / BP)

/** Полная сумма к списанию при оформлении. */
export const purchaseTotal = (priceTiyin, feeBp) =>
  num(priceTiyin) + purchaseFee(priceTiyin, feeBp)

// ─────────────────────────────────────────────────────────────
// Абонплата за содержание
// ─────────────────────────────────────────────────────────────

/**
 * Сколько месяцев содержания накопилось к дате.
 * Считаем завершённые месяцы: пока месяц не прошёл, платить не за что.
 */
export const boardingMonthsDue = (startsAt, asOf = new Date()) => {
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return 0
  return Math.max(0, monthsBetween(start, asOf))
}

/** Начисленная абонплата за весь срок владения на дату. */
export const boardingDue = (contract, asOf = new Date()) =>
  boardingMonthsDue(contract.starts_at, asOf) * num(contract.boarding_fee_monthly_tiyin)

/** Непогашенный остаток по содержанию. */
export const boardingOutstanding = (contract) =>
  Math.max(0, num(contract.boarding_accrued_tiyin) - num(contract.boarding_paid_tiyin))

// ─────────────────────────────────────────────────────────────
// INVESTMENT — покупка ради продажи
// ─────────────────────────────────────────────────────────────

/**
 * Прогнозная выручка от продажи: текущий вес × цена за килограмм.
 * Это ожидание, а не обещание: и вес, и цена меняются.
 */
export const projectedRevenue = (animal) => {
  const kg = num(animal.current_weight_g) / 1000
  return Math.round(kg * num(animal.price_per_kg_tiyin))
}

/**
 * Что клиент получит, если продать животное прямо сейчас.
 *
 * Порядок вычетов важен: сначала гасится долг по содержанию, потом
 * считается прибыль, и только с неё берётся комиссия. Комиссия с выручки
 * означала бы, что при падении цены клиент платит за собственный убыток.
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

  // Долг по содержанию: либо уже начисленный, либо считаем по сроку
  const boarding = num(contract.boarding_accrued_tiyin) > 0
    ? boardingOutstanding(contract)
    : boardingDue(contract, asOf)

  // Знаковый результат — для показа клиенту. Отдельно от profit намеренно:
  // profit обрезан по нулю ради комиссии (брать процент с убытка нельзя),
  // и если показывать его же, убыток на экране превращается в «0» —
  // человек видит ноль и не понимает, потерял он что-то или нет.
  const pnl = gross - principal - boarding

  const profit = Math.max(0, pnl)
  const feeClient = Math.round(profit * num(profitFeeClientBp) / BP)
  const feeFarm = Math.round(profit * num(profitFeeFarmBp) / BP)

  // Клиент не может получить меньше нуля: если выручки не хватило даже
  // на содержание, недостача остаётся долгом, а не отрицательной выплатой
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
    // Доходность относительно вложенного — для показа клиенту
    return_pct: principal ? (net - principal) / principal : 0,
  }
}

// ─────────────────────────────────────────────────────────────
// OWNERSHIP — покупка ради мяса
// ─────────────────────────────────────────────────────────────

/**
 * Сводка по договору владения. Денежного возврата нет: клиент забирает
 * животное или мясо, а платит только за содержание.
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
// INSTALLMENT — рассрочка
// ─────────────────────────────────────────────────────────────

/**
 * График платежей. Остаток от деления кидаем в первый платёж, чтобы сумма
 * графика сошлась с ценой до тийина — иначе на 12 месяцах теряется до
 * 11 тийин и договор никогда не закроется.
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

/** Пеня за просрочку. lateFeeBp — за каждый день. */
export const lateFee = (installment, lateFeeBp, asOf = new Date()) => {
  if (!lateFeeBp) return 0
  const days = Math.max(0, daysBetween(new Date(installment.due_date), asOf))
  const unpaid = num(installment.amount_tiyin) - num(installment.paid_tiyin)
  return Math.round(unpaid * num(lateFeeBp) / BP * days)
}

// ─────────────────────────────────────────────────────────────
// Роутер по модели
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
