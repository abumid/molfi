/**
 * The "where the animal lives" string.
 *
 * A farm name often already contains the town ("Molfi Chirchiq"), and blindly
 * gluing the address on gave "Molfi Chirchiq · Tashkent region, Chirchiq" —
 * Chirchiq twice in one line.
 */
export const placeLine = (farmName, farmLocation) => {
  const name = (farmName || '').trim()
  const loc = (farmLocation || '').trim()
  if (!name) return loc
  if (!loc) return name

  // Drop the parts of the address already spoken by the farm name
  const inName = new Set(
    name.toLowerCase().split(/[\s·,]+/).filter(w => w.length > 2))

  const rest = loc
    .split(',')
    .map(part => part.trim())
    .filter(part => part && !part.toLowerCase().split(/\s+/).every(w => inName.has(w)))
    .join(', ')

  return rest ? `${name} · ${rest}` : name
}

/** Age in months. null when the birth date is not filled in. */
export const ageMonths = (d) => {
  if (!d) return null
  const b = new Date(d)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  return (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
}

/**
 * Weight gain in kilograms per month, from the recorded history.
 *
 * "52 kg" says nothing to someone who does not breed rams.
 * "+3.4 kg per month" says the main thing: the animal grows, the money works.
 *
 * Computed over the whole span, not the last two records: if the farm weighed
 * the animal twice in one week, the difference between those two divided by
 * the term gives a meaningless jump.
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
