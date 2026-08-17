const API_ROOT = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const BASE = `${API_ROOT}/api`
const getToken = () => localStorage.getItem('molfi_admin_token')

export const api = {
  get: async (path) => {
    const res = await fetch(BASE + path, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  post: async (path, body) => {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  put: async (path, body) => {
    const res = await fetch(BASE + path, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  delete: async (path) => {
    const res = await fetch(BASE + path, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }
}

// Валюта и разделители зависят от языка: при английском интерфейсе
// суммы не должны выходить по-русски.
const LOCALE = { en: 'en-US', ru: 'ru-RU', uz: 'uz-UZ' }
const CURRENCY = { en: 'UZS', ru: 'сум', uz: "so'm" }

export const formatSum = (tiyin, language = 'en') => {
  const num = Math.floor((Number(tiyin) || 0) / 100)
  const locale = LOCALE[language] || LOCALE.en
  const currency = CURRENCY[language] || CURRENCY.en
  return `${new Intl.NumberFormat(locale).format(num)} ${currency}`
}

export const formatDate = (date, language = 'en') => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(LOCALE[language] || LOCALE.en, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

/** Без времени — для сроков платежей и дат рождения. */
export const formatDay = (date, language = 'en') => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(LOCALE[language] || LOCALE.en, {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}
