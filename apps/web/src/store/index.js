import { create } from 'zustand'
import { api } from '../utils/api'
import { store as ls } from '../utils/storage'

const TOKEN_KEY = 'molfi_token'
const LANG_KEY = 'molfi_lang'

export const useStore = create((set) => ({
  token: ls.get(TOKEN_KEY) || null,
  user: null,
  isAuthenticated: false,
  // Starts as true: until restoreSession() finishes (successfully or not) the
  // routes must not decide whether the user is authenticated — otherwise
  // PrivateRoute manages to bounce an already signed-in user to /auth before
  // the session is restored (a race on page load/refresh).
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

  // Which models are open is decided by the backend via settings.models_enabled.
  // The client must not know that the disabled ones exist.
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

  // Top-up and withdrawal requests. Until Click and Payme are connected an admin
  // moves the money, and the client sees what stage their request is at.
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
