import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { init, isTMA } from '@telegram-apps/sdk'

// SDK v3 требует init() до вызова scope-функций (requestContact и т.п.)
try {
  if (isTMA()) init()
} catch (e) {
  console.warn('Telegram SDK init skipped:', e?.message)
}

// restoreSession()/fetchSheep() запускаются один раз внутри App.jsx (Layout) —
// раньше они дублировались здесь, из-за чего каждый запуск делал двойные
// запросы к /auth/me и /sheep.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
