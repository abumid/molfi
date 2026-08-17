import { create } from 'zustand'
import { api } from '../utils/api'

const TOKEN_KEY = 'molfi_token'
const LANG_KEY = 'molfi_lang'

export const useStore = create((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,
  isAuthenticated: false,
  // Начинаем с true: пока restoreSession() не отработает (успешно или нет),
  // маршруты не должны решать, авторизован пользователь или нет — иначе
  // PrivateRoute успевает перекинуть уже вошедшего пользователя на /auth
  // до того, как сессия восстановится (гонка при загрузке/обновлении страницы).
  isLoading: true,
  language: localStorage.getItem(LANG_KEY) || 'en',
  sheep: [],
  myShares: [],
  transactions: [],
  balance: 0,

  login: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token)
    set({ token, user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, user: null, isAuthenticated: false, myShares: [], balance: 0, transactions: [] })
  },

  restoreSession: async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) { set({ isLoading: false }); return }
    set({ isLoading: true })
    try {
      const data = await api.get('/auth/me')
      set({ token, user: data.user, isAuthenticated: true, isLoading: false })
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      set({ token: null, isAuthenticated: false, isLoading: false })
    }
  },

  fetchSheep: async () => {
    try {
      const data = await api.get('/sheep')
      set({ sheep: data.sheep || [] })
    } catch (e) { console.error(e) }
  },

  fetchMyShares: async () => {
    const { user, token } = get()
    if (!user || !token) return
    try {
      const data = await api.get(`/shares/user/${user.id}`)
      set({ myShares: data.shares || [] })
    } catch (e) { console.error('fetchMyShares error:', e.message) }
  },

  fetchBalance: async () => {
    try {
      const data = await api.get('/wallet/balance')
      set({ balance: data.balance || 0 })
    } catch (e) { console.error(e) }
  },

  fetchTransactions: async () => {
    try {
      const data = await api.get('/wallet/transactions')
      set({ transactions: data.transactions || [] })
    } catch (e) { console.error(e) }
  },

  setLanguage: (lang) => {
    localStorage.setItem(LANG_KEY, lang)
    set({ language: lang })
  },

  updateProfile: (updates) => {
    set(state => ({
      user: state.user
        ? { ...state.user, ...updates }
        : state.user
    }))
  },
}))
