import { create } from 'zustand'
import { api } from '../utils/api'
import { store as ls } from '../utils/storage'

const TOKEN_KEY = 'molfi_token'
const LANG_KEY = 'molfi_lang'

export const useStore = create((set) => ({
  token: ls.get(TOKEN_KEY) || null,
  user: null,
  isAuthenticated: false,
  // Начинаем с true: пока restoreSession() не отработает (успешно или нет),
  // маршруты не должны решать, авторизован пользователь или нет — иначе
  // PrivateRoute успевает перекинуть уже вошедшего пользователя на /auth
  // до того, как сессия восстановится (гонка при загрузке/обновлении страницы).
  isLoading: true,
  language: ls.get(LANG_KEY) || 'en',
  products: [],
  contracts: [],
  models: [],
  transactions: [],
  paymentRequests: [],
  balance: 0,

  login: (token, user) => {
    ls.set(TOKEN_KEY, token)
    set({ token, user, isAuthenticated: true })
  },

  logout: () => {
    ls.remove(TOKEN_KEY)
    set({ token: null, user: null, isAuthenticated: false, contracts: [], balance: 0, transactions: [] })
  },

  restoreSession: async () => {
    const token = ls.get(TOKEN_KEY)
    if (!token) { set({ isLoading: false }); return }
    set({ isLoading: true })
    try {
      const data = await api.get('/auth/me')
      set({ token, user: data.user, isAuthenticated: true, isLoading: false })
    } catch {
      ls.remove(TOKEN_KEY)
      set({ token: null, isAuthenticated: false, isLoading: false })
    }
  },

  // Какие модели открыты — решает бэкенд через settings.models_enabled.
  // Клиент не должен знать про существование выключенных.
  fetchModels: async () => {
    try {
      const data = await api.get('/models')
      set({ models: data.models || [] })
    } catch (e) { console.error(e) }
  },

  fetchProducts: async (model) => {
    try {
      const data = await api.get('/products' + (model ? `?model=${model}` : ''))
      set({ products: data.products || [] })
    } catch (e) { console.error(e) }
  },

  fetchContracts: async () => {
    try {
      const data = await api.get('/contracts')
      set({ contracts: data.contracts || [] })
    } catch (e) { console.error(e) }
  },

  fetchBalance: async () => {
    try {
      const data = await api.get('/wallet/balance')
      set({ balance: data.balance || 0 })
    } catch (e) { console.error(e) }
  },

  // Заявки на пополнение и вывод. Пока Click и Payme не подключены,
  // деньги двигает админ, а клиент видит, на какой стадии его просьба.
  fetchPaymentRequests: async () => {
    try {
      const data = await api.get('/payment-requests')
      set({ paymentRequests: data.requests || [] })
    } catch (e) { console.error(e) }
  },

  fetchTransactions: async () => {
    try {
      const data = await api.get('/wallet/transactions')
      set({ transactions: data.transactions || [] })
    } catch (e) { console.error(e) }
  },

  setLanguage: (lang) => {
    ls.set(LANG_KEY, lang)
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
