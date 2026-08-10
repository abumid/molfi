export const tiyinToSum = (tiyin) => Math.floor(tiyin / 100)
export const sumToTiyin = (sum) => Math.round(sum * 100)
export const formatSum = (tiyin) => new Intl.NumberFormat('ru-UZ').format(tiyinToSum(tiyin)) + ' сум'
