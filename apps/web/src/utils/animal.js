/**
 * Строка «где живёт животное».
 *
 * Название фермы часто уже содержит населённый пункт («Молфи Чирчик»),
 * и слепая склейка с адресом давала «Молфи Чирчик · Ташкентская
 * область, Чирчик» — Чирчик дважды в одной строке.
 */
export const placeLine = (farmName, farmLocation) => {
  const name = (farmName || '').trim()
  const loc = (farmLocation || '').trim()
  if (!name) return loc
  if (!loc) return name

  // Из адреса выбрасываем куски, которые уже прозвучали в названии фермы
  const inName = new Set(
    name.toLowerCase().split(/[\s·,]+/).filter(w => w.length > 2))

  const rest = loc
    .split(',')
    .map(part => part.trim())
    .filter(part => part && !part.toLowerCase().split(/\s+/).every(w => inName.has(w)))
    .join(', ')

  return rest ? `${name} · ${rest}` : name
}

/** Возраст в месяцах. null, если дата рождения не заполнена. */
export const ageMonths = (d) => {
  if (!d) return null
  const b = new Date(d)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  return (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
}

/**
 * Прибавка в килограммах за месяц по истории замеров.
 *
 * «52 кг» ничего не говорит человеку, который не разводит баранов.
 * «+3,4 кг за месяц» говорит главное: животное растёт, деньги работают.
 *
 * Считаем по всему отрезку, а не по двум последним замерам: если ферма
 * взвесила дважды за неделю, разница между ними даёт бессмысленный
 * скачок при делении на срок.
 */
export const gainPerMonth = (weights) => {
  if (!weights || weights.length < 2) return null

  const sorted = [...weights].sort(
    (a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  const days = (new Date(last.recorded_at) - new Date(first.recorded_at)) / 864e5
  if (!(days > 0)) return null

  const deltaKg = (Number(last.weight_g) - Number(first.weight_g)) / 1000
  const perMonth = deltaKg / days * 30

  return Number.isFinite(perMonth) ? perMonth : null
}
