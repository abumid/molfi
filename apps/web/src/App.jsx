import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store'
import BottomNav from './components/layout/BottomNav'
import Onboarding from './pages/Onboarding'
import Auth from './pages/Auth'
import Catalog from './pages/Catalog'
import SheepDetail from './pages/SheepDetail'
import BuyShare from './pages/BuyShare'
import Wallet from './pages/Wallet'
import Profile from './pages/Profile'
import Admin from './pages/Admin'

const NAV_PATHS = ['/catalog', '/wallet', '/profile']

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a0f0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#7a9a7a',
    }}>
      Загрузка...
    </div>
  )
}

function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading } = useStore()
  // Ждём восстановления сессии, иначе уже вошедшего пользователя может
  // на мгновение перекинуть на /auth раньше, чем restoreSession() успеет
  // отработать (например, при обновлении страницы).
  if (isLoading) return <LoadingScreen />
  return isAuthenticated ? children : <Navigate to="/auth" replace />
}

function AdminRoute({ children }) {
  const { isAuthenticated, user, isLoading } = useStore()

  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  if (user?.role !== 'admin') return <Navigate to="/catalog" replace />
  return children
}

function Layout() {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useStore()
  const restoreSession = useStore(s => s.restoreSession)
  const fetchSheep = useStore(s => s.fetchSheep)

  // Единственное место, где восстанавливается сессия и загружается каталог —
  // раньше это же самое вызывалось повторно в main.jsx при старте приложения,
  // из-за чего /auth/me и /sheep запрашивались дважды при каждом запуске.
  useEffect(() => {
    restoreSession().finally(() => fetchSheep())
  }, [])

  return (
    <>
      <Routes>
        <Route path="/" element={
          isLoading ? <LoadingScreen /> : (isAuthenticated ? <Navigate to="/catalog" replace /> : <Onboarding />)
        } />
        <Route path="/auth" element={<Auth />} />
        <Route path="/catalog" element={<PrivateRoute><Catalog /></PrivateRoute>} />
        <Route path="/sheep/:id" element={<PrivateRoute><SheepDetail /></PrivateRoute>} />
        <Route path="/sheep/:id/buy" element={<PrivateRoute><BuyShare /></PrivateRoute>} />
        <Route path="/wallet" element={<PrivateRoute><Wallet /></PrivateRoute>} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
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
