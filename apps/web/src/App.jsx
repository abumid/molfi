import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store'
import { store as ls } from './utils/storage'
import { useT } from './i18n'
import BottomNav from './components/layout/BottomNav'
import Landing from './pages/Landing'
import Legal from './pages/Legal'
import Onboarding from './pages/Onboarding'
import Auth from './pages/Auth'
import Catalog from './pages/Catalog'
import ProductDetail from './pages/ProductDetail'
import Checkout from './pages/Checkout'
import Contracts from './pages/Contracts'
import ContractDetail from './pages/ContractDetail'
import Wallet from './pages/Wallet'
import Profile from './pages/Profile'

// The menu is shown on root screens. It is deliberately absent on detail and
// checkout screens: those have their own bottom action button, and two bars on
// top of each other cover the content.
const NAV_PATHS = ['/catalog', '/contracts', '/wallet', '/profile']

function LoadingScreen() {
  const language = useStore(s => s.language)
  const t = useT(language)
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif',
    }}>
      {t.common.loading}
    </div>
  )
}

function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading } = useStore()
  const location = useLocation()
  // Wait for the session to be restored, otherwise an already signed-in user
  // can be bounced to /auth for a moment before restoreSession() finishes (on a
  // page refresh, for example).
  if (isLoading) return <LoadingScreen />
  if (isAuthenticated) return children
  // Remember where the person was heading: after sign-in they go back there
  // rather than landing in the catalogue having forgotten which ram they picked
  return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />
}

/**
 * The landing is not needed inside Telegram: the mini app is opened from the
 * bot, the person already came to buy, and a marketing page only gets in the way.
 */
const inTelegram = () => {
  try {
    return Boolean(window.Telegram?.WebApp?.initData)
  } catch {
    return false
  }
}

function Layout() {
  const location = useLocation()
  const { isLoading } = useStore()
  const restoreSession = useStore(s => s.restoreSession)
  const fetchModels = useStore(s => s.fetchModels)
  const fetchContracts = useStore(s => s.fetchContracts)

  // The single place where the session is restored and the catalogue is loaded —
  // the same calls used to be repeated in main.jsx at start-up, so /auth/me and
  // /sheep were requested twice on every launch.
  //
  // Contracts are fetched here too: the bottom menu decides from them whether to
  // show the unpaid-care dot, and the menu lives on every screen.
  useEffect(() => {
    restoreSession().finally(() => {
      fetchModels()
      if (ls.get('molfi_token')) fetchContracts()
    })
  }, [])

  return (
    <>
      <Routes>
        {/* The molfi.uz root is a public page, and it is shown to signed-in
            users as well: otherwise the site owner cannot open it without
            logging out. The "Open the app" button leads to the catalogue or to
            sign-in, depending on whether the person is authenticated.
            Inside Telegram the landing is skipped: people arrive from the bot to buy. */}
        <Route path="/" element={
          isLoading ? <LoadingScreen />
            : inTelegram() ? <Onboarding />
            : <Landing />
        } />
        <Route path="/auth" element={<Auth />} />
        {/* Offer and privacy are public: the landing footer links to them, and
            they are read before sign-up */}
        <Route path="/offer" element={<Legal doc="offer" />} />
        <Route path="/privacy" element={<Legal doc="privacy" />} />
        {/* The catalogue is closed: offers can only be viewed after sign-in.
            PrivateRoute remembers where the person was heading and returns them
            there after login — otherwise they land in the catalogue having
            forgotten which card they had open. */}
        <Route path="/catalog" element={<PrivateRoute><Catalog /></PrivateRoute>} />
        <Route path="/product/:id" element={<PrivateRoute><ProductDetail /></PrivateRoute>} />
        <Route path="/product/:id/checkout" element={<PrivateRoute><Checkout /></PrivateRoute>} />
        <Route path="/contracts" element={<PrivateRoute><Contracts /></PrivateRoute>} />
        <Route path="/contracts/:id" element={<PrivateRoute><ContractDetail /></PrivateRoute>} />
        <Route path="/wallet" element={<PrivateRoute><Wallet /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
      </Routes>
      {NAV_PATHS.includes(location.pathname) && <BottomNav />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
