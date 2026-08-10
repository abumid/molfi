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

export const formatSum = (tiyin) => {
  const num = Number(tiyin) || 0
  return new Intl.NumberFormat('ru-UZ').format(
    Math.floor(num / 100)
  ) + ' сум'
}

export const formatDate = (date) => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
