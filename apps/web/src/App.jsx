import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store'
import { useT } from './i18n'
import BottomNav from './components/layout/BottomNav'
import Landing from './pages/Landing'
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
  // Ждём восстановления сессии, иначе уже вошедшего пользователя может
  // на мгновение перекинуть на /auth раньше, чем restoreSession() успеет
  // отработать (например, при обновлении страницы).
  if (isLoading) return <LoadingScreen />
  if (isAuthenticated) return children
  // Запоминаем, куда человек шёл: после входа вернём туда же, а не
  // высадим в каталог, где он уже не помнит, какого барана выбирал
  return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />
}

/**
 * В Telegram лендинг не нужен: мини-приложение открывают из бота, человек
 * уже пришёл за покупкой, и рекламная страница здесь только мешает.
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
        {/* Корень molfi.uz — публичная страница, и вошедшему она тоже
            показывается: иначе владелец сайта не может её открыть, не
            выйдя из аккаунта. Кнопка «Открыть приложение» ведёт в каталог
            или на вход — смотря авторизован человек или нет.
            В Telegram лендинг пропускаем: туда приходят из бота за покупкой. */}
        <Route path="/" element={
          isLoading ? <LoadingScreen />
            : inTelegram() ? <Onboarding />
            : <Landing />
        } />
        <Route path="/auth" element={<Auth />} />
        {/* Каталог закрыт: смотреть предложения можно только после входа.
            PrivateRoute запоминает, куда человек шёл, и вернёт его туда
            же после логина — иначе он попадает в каталог, забыв, какую
            карточку открывал. */}
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
