// Money and date formatting, language aware.
// formatSum used to be copied into four pages, and in all of them the currency
// was hardcoded as "сум" and the locale as ru-UZ — so an English interface
// still printed sums in Russian.

const LOCALE = { en: 'en-US', ru: 'ru-RU', uz: 'uz-UZ' }
const CURRENCY = { en: 'UZS', ru: 'сум', uz: "so'm" }

export const formatSum = (tiyin, language = 'en') => {
  const n = Math.floor((Number(tiyin) || 0) / 100)
  const locale = LOCALE[language] || LOCALE.en
  const currency = CURRENCY[language] || CURRENCY.en
  return `${new Intl.NumberFormat(locale).format(n)} ${currency}`
}

const MILLION = { en: 'M', ru: 'млн', uz: 'mln' }

/**
 * Short form for summaries: "2.81M" instead of "2,811,120 UZS".
 * In totals the order of magnitude is what matters, and exact tiyin only get
 * in the way of comparing three numbers at a glance.
 *
 * The decimal separator comes from Intl rather than a replace: the Uzbek
 * locale has its own, and hardcoding a dot-to-comma swap would lie there.
 */
export const formatShort = (tiyin, language = 'en') => {
  const locale = LOCALE[language] || LOCALE.en
  const sums = Math.round((Number(tiyin) || 0) / 100)
  if (Math.abs(sums) < 1e6) return new Intl.NumberFormat(locale).format(sums)

  const mln = sums / 1e6
  const digits = Math.abs(mln) < 10 ? 2 : 1
  const num = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0, maximumFractionDigits: digits,
  }).format(mln)
  // English writes "2.81M" joined up, Russian and Uzbek use a space
  const suffix = MILLION[language] || MILLION.en
  return language === 'en' ? `${num}${suffix}` : `${num} ${suffix}`
}

/** Without the currency symbol — when the unit is already labelled nearby. */
export const formatNumber = (value, language = 'en') =>
  new Intl.NumberFormat(LOCALE[language] || LOCALE.en).format(Number(value) || 0)

export const formatDate = (value, language = 'en') => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(LOCALE[language] || LOCALE.en)
}

export const currencyLabel = (language = 'en') => CURRENCY[language] || CURRENCY.en
