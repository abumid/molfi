// Форматирование денег и дат с учётом языка.
// Раньше formatSum был скопирован в четыре страницы, и во всех
// валюта была зашита как «сум», а локаль как ru-UZ — при английском
// интерфейсе суммы всё равно выходили по-русски.

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
 * Короткая запись суммы для сводок: «2,81 млн» вместо «2 811 120 сум».
 * В итогах важен порядок величины, а точные тийины только мешают
 * сравнивать три числа взглядом.
 *
 * Разделитель дробной части берём у Intl, а не через replace: в узбекской
 * локали он свой, и жёсткая замена точки на запятую там врала бы.
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
  // По-английски пишут «2.81M» слитно, по-русски и по-узбекски — через пробел
  const suffix = MILLION[language] || MILLION.en
  return language === 'en' ? `${num}${suffix}` : `${num} ${suffix}`
}

/** Без символа валюты — когда единица уже подписана рядом. */
export const formatNumber = (value, language = 'en') =>
  new Intl.NumberFormat(LOCALE[language] || LOCALE.en).format(Number(value) || 0)

export const formatDate = (value, language = 'en') => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(LOCALE[language] || LOCALE.en)
}

export const currencyLabel = (language = 'en') => CURRENCY[language] || CURRENCY.en
