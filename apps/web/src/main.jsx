import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { init, isTMA } from '@telegram-apps/sdk'

// SDK v3 requires init() before any scope function is called (requestContact etc.)
try {
  if (isTMA()) init()
} catch (e) {
  console.warn('Telegram SDK init skipped:', e?.message)
}

// restoreSession()/fetchModels() run once inside App.jsx (Layout) — they used to
// be duplicated here, so every start made double requests to /auth/me and
// /sheep.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
