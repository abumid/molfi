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
