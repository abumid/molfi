const CLOSED = ['completed', 'cancelled', 'defaulted']
const num = (v) => Number(v) || 0

/**
 * Portfolio summary for the balance card.
 *
 * Investment and ownership are counted apart on purpose. An investment has a
 * value today — weight × price per kilogram — and it moves with every weigh-in.
 * Ownership has none: that asset is not for sale, the client takes the meat,
 * and there is no market price for it. The two can be added into one number,
 * but then half of the sum grows and half stands still, and the person cannot
 * tell why their "balance" behaves oddly.
 *
 * Profit is counted on investments only: ownership has neither revenue nor a
 * price loss — only the cost of boarding.
 */
export const portfolioTotals = (contracts = [], balanceTiyin = 0) => {
  const live = contracts.filter(c => !CLOSED.includes(c.status))

  const investments = live.filter(c => c.model_type === 'investment')
  const ownerships = live.filter(c => c.model_type === 'ownership')

  const investmentWorth = investments.reduce((s, c) => s + num(c.summary?.gross), 0)
  const ownershipValue = ownerships.reduce((s, c) => s + num(c.principal_tiyin), 0)

  // The signed result comes from the server: a profit clamped at zero would
  // show a loss as nothing
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
    // Everything the person owns: free money plus both kinds of asset
    total: num(balanceTiyin) + investmentWorth + ownershipValue,
    // Boarding debt across all live contracts — also visible in the wallet
    boardingDue: live.reduce(
      (s, c) => s + Math.max(0, num(c.boarding_accrued_tiyin) - num(c.boarding_paid_tiyin)), 0),
  }
}
