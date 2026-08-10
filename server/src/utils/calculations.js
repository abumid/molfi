// Прогноз стоимости доли по текущему весу
export const calcProjectedPayout = (sheep, sharePct) => {
  const weightKg = (sheep.current_weight_g || 0) / 1000
  const pricePerKg = sheep.price_per_kg_tiyin || 4500000
  const grossRevenue = weightKg * pricePerKg
  const platformFee = grossRevenue * 0.10
  const investorPool = grossRevenue - platformFee
  return Math.round(investorPool * (sharePct / 100))
}

// Финальный расчёт выплаты после продажи
export const calcFinalPayout = (sheep, sharePct) => {
  // Если есть реальная цена продажи — использовать её
  const salePrice = sheep.final_sale_price_tiyin
    || (() => {
      const weightKg = (sheep.final_weight_g || sheep.current_weight_g) / 1000
      return weightKg * (sheep.price_per_kg_tiyin || 4500000)
    })()
  const platformFee = salePrice * 0.10
  const investorPool = salePrice - platformFee
  return Math.round(investorPool * (sharePct / 100))
}

// Прогноз прибыли в процентах
export const calcProfitPercent = (sheep, sharePct, purchasePriceTiyin) => {
  const projected = calcProjectedPayout(sheep, sharePct)
  if (!purchasePriceTiyin) return 0
  return Math.round((projected - purchasePriceTiyin) / purchasePriceTiyin * 100)
}
