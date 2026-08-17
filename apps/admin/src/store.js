import { create } from 'zustand'
import { api } from './api'

export const useStore = create((set, get) => ({
  token: localStorage.getItem('molfi_admin_token') || null,
  admin: null,
  isAuthenticated: false,
  isLoading: true,
  language: localStorage.getItem('molfi_admin_lang') || 'en',

  login: async (phone, password) => {
    const data = await api.post('/auth/login', { phone, password })
    if (data.user?.role !== 'admin') {
      throw new Error('no_access')
    }
    localStorage.setItem('molfi_admin_token', data.token)
    set({ token: data.token, admin: data.user, isAuthenticated: true })
    return data
  },

  logout: () => {
    localStorage.removeItem('molfi_admin_token')
    set({ token: null, admin: null, isAuthenticated: false })
  },

  restoreSession: async () => {
    const token = localStorage.getItem('molfi_admin_token')
    if (!token) { set({ isLoading: false }); return }
    try {
      const data = await api.get('/auth/me')
      if (data.user?.role !== 'admin') throw new Error('not_admin')
      set({ token, admin: data.user, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.removeItem('molfi_admin_token')
      set({ token: null, isAuthenticated: false, isLoading: false })
    }
  },

  setLanguage: (lang) => {
    localStorage.setItem('molfi_admin_lang', lang)
    set({ language: lang })
  },
}))
