import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Sheep from './pages/Sheep'
import Shares from './pages/Shares'
import Transactions from './pages/Transactions'
import Activity from './pages/Activity'

const Guard = ({ children }) => {
  const { isAuthenticated, isLoading } = useStore()
  if (isLoading) return (
    <div style={{
      minHeight: '100vh', background: '#0f1117',
      display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#8892a4',
      fontSize: 16
    }}>
      Yuklanmoqda...
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
        <Route path="/sheep" element={<Guard><Sheep /></Guard>} />
        <Route path="/shares" element={<Guard><Shares /></Guard>} />
        <Route path="/transactions" element={<Guard><Transactions /></Guard>} />
        <Route path="/activity" element={<Guard><Activity /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
