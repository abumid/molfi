import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store'
import { useT } from './i18n'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Animals from './pages/Animals'
import Products from './pages/Products'
import Contracts from './pages/Contracts'
import Payments from './pages/Payments'
import Transactions from './pages/Transactions'
import Requests from './pages/Requests'
import Activity from './pages/Activity'
import Settings from './pages/Settings'

const Guard = ({ children }) => {
  const { isAuthenticated, isLoading, language } = useStore()
  const t = useT(language)
  if (isLoading) return (
    <div style={{
      minHeight: '100vh', background: '#0f1117',
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#8892a4',
      fontSize: 16
    }}>
      {t('common.loading')}
    </div>
  )
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { restoreSession } = useStore()
  useEffect(() => { restoreSession() }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Guard><Dashboard /></Guard>} />
        <Route path="/users" element={<Guard><Users /></Guard>} />
        <Route path="/animals" element={<Guard><Animals /></Guard>} />
        <Route path="/products" element={<Guard><Products /></Guard>} />
        <Route path="/contracts" element={<Guard><Contracts /></Guard>} />
        <Route path="/payments" element={<Guard><Payments /></Guard>} />
        <Route path="/activity" element={<Guard><Activity /></Guard>} />
        <Route path="/transactions" element={<Guard><Transactions /></Guard>} />
        <Route path="/requests" element={<Guard><Requests /></Guard>} />
        <Route path="/settings" element={<Guard><Settings /></Guard>} />
        {/* Legacy addresses: /sheep and /shares from v1 */}
        <Route path="/sheep" element={<Navigate to="/animals" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
