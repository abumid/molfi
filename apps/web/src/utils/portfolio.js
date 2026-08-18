const CLOSED = ['completed', 'cancelled', 'defaulted']
const num = (v) => Number(v) || 0

/**
 * Сводка по портфелю для карточки баланса.
 *
 * Инвестиция и владение считаются раздельно намеренно. У инвестиции есть
 * сегодняшняя стоимость — вес × цена за килограмм, и она меняется с каждым
 * взвешиванием. У владения её нет: этот актив не продаётся, клиент забирает
 * мясо, и рыночной цены у него не существует. Сложить их в одно число можно,
 * но тогда половина суммы растёт, а половина стоит на месте, и человек не
 * понимает, почему «баланс» ведёт себя странно.
 *
 * Прибыль считается только по инвестициям: у владения нет ни выручки, ни
 * убытка от цены — есть только расход на содержание.
 */
export const portfolioTotals = (contracts = [], balanceTiyin = 0) => {
  const live = contracts.filter(c => !CLOSED.includes(c.status))

  const investments = live.filter(c => c.model_type === 'investment')
  const ownerships = live.filter(c => c.model_type === 'ownership')

  const investmentWorth = investments.reduce((s, c) => s + num(c.summary?.gross), 0)
  const ownershipValue = ownerships.reduce((s, c) => s + num(c.principal_tiyin), 0)

  // Знаковый результат приходит с сервера: обрезанный по нулю profit
  // показывал бы убыток нулём
  const pnl = investments.reduce((s, c) => s + num(c.summary?.pnl), 0)

  return {
    free: num(balanceTiyin),
    investmentWorth,
    ownershipValue,
    invested: live.reduce((s, c) => s + num(c.principal_tiyin), 0),
    investedInInvestments: investments.reduce((s, c) => s + num(c.principal_tiyin), 0),
    pnl,
    count: live.length,
    hasInvestments: investments.length > 0,
    hasOwnership: ownerships.length > 0,
    // Всё, чем человек владеет: свободные деньги плюс оба вида активов
    total: num(balanceTiyin) + investmentWorth + ownershipValue,
    // Долг за содержание по всем живым договорам — его видно и в кошельке
    boardingDue: live.reduce(
      (s, c) => s + Math.max(0, num(c.boarding_accrued_tiyin) - num(c.boarding_paid_tiyin)), 0),
  }
}
