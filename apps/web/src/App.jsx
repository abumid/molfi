import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store'
import BottomNav from './components/layout/BottomNav'
import Onboarding from './pages/Onboarding'
import Auth from './pages/Auth'
import Catalog from './pages/Catalog'
import ProductDetail from './pages/ProductDetail'
import Checkout from './pages/Checkout'
import Contracts from './pages/Contracts'
import ContractDetail from './pages/ContractDetail'
import Wallet from './pages/Wallet'
import Profile from './pages/Profile'

// Меню показываем на корневых экранах. На карточках и оформлении его нет
// намеренно: там своя нижняя кнопка действия, две панели друг на друге
// перекрывают контент.
const NAV_PATHS = ['/catalog', '/contracts', '/wallet', '/profile']

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

function Layout() {
  const location = useLocation()
  const { isAuthenticated, isLoading } = useStore()
  const restoreSession = useStore(s => s.restoreSession)
  const fetchModels = useStore(s => s.fetchModels)
  const fetchContracts = useStore(s => s.fetchContracts)

  // Единственное место, где восстанавливается сессия и загружается каталог —
  // раньше это же самое вызывалось повторно в main.jsx при старте приложения,
  // из-за чего /auth/me и /sheep запрашивались дважды при каждом запуске.
  //
  // Договоры тянем здесь же: по ним нижнее меню решает, показывать ли точку
  // о неоплаченном уходе, а меню живёт на всех экранах сразу.
  useEffect(() => {
    restoreSession().finally(() => {
      fetchModels()
      if (localStorage.getItem('molfi_token')) fetchContracts()
    })
  }, [])

  return (
    <>
      <Routes>
        <Route path="/" element={
          isLoading ? <LoadingScreen /> : (isAuthenticated ? <Navigate to="/catalog" replace /> : <Onboarding />)
        } />
        <Route path="/auth" element={<Auth />} />
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
