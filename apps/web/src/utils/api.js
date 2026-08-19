const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const BASE_URL = `${API_BASE}/api`
const TOKEN_KEY = 'molfi_token'

import { store as ls } from './storage'

export const getToken = () => ls.get(TOKEN_KEY)

export const authHeaders = () => {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const api = {
  get: async (path) => {
    const res = await fetch(`${BASE_URL}${path}`, { headers: authHeaders() })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  post: async (path, body) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  put: async (path, body) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
  // Named del rather than delete: delete is a reserved word, and as an object
  // method name it reads worse than it works
  del: async (path) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: authHeaders()
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }
}
