import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from './store'
import { useT } from './i18n'

export default function Layout({ children, title }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { admin, logout, language, setLanguage } = useStore()
  const t = useT(language)

  const NAV = [
    { path: '/', icon: '📊', label: t('nav.dashboard') },
    { path: '/users', icon: '👥', label: t('nav.users') },
    { path: '/sheep', icon: '🐑', label: t('nav.sheep') },
    { path: '/activity', icon: '📋', label: t('nav.activity') },
    { path: '/shares', icon: '📈', label: t('nav.shares') },
    { path: '/transactions', icon: '💰', label: t('nav.transactions') },
  ]

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          Molfi
          <span>{t('nav.adminPanel')}</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <button
              key={item.path}
              className={`nav-item ${pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="lang-toggle">
            {['uz', 'ru'].map(lang => (
              <button
                key={lang}
                className={`lang-btn ${language === lang ? 'active' : ''}`}
                onClick={() => setLanguage(lang)}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{
            fontSize: 12, color: '#8892a4', marginBottom: 10,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            👤 {admin?.phone}
          </div>

          <button
            className="btn btn-secondary"
            style={{ width: '100%' }}
            onClick={logout}
          >
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="topbar-user">
            <span style={{
              background: 'rgba(111,207,74,0.15)',
              color: '#6fcf4a',
              padding: '3px 10px',
              borderRadius: 20,
              fontSize: 12
            }}>
              Admin
            </span>
          </div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  )
}
