import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from './store'
import { useT, LANGUAGES } from './i18n'

export default function Layout({ children, title }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { admin, logout, language, setLanguage } = useStore()
  const t = useT(language)

  // Девять пунктов — сайдбар плотный, поэтому разбит на две группы.
  // Ферма — то, чем управляет зоотехник; продажи — то, чем финансист.
  const GROUPS = [
    {
      items: [
        { path: '/', icon: '📊', label: t('nav.dashboard') },
      ],
    },
    {
      items: [
        { path: '/animals', icon: '🐑', label: t('nav.animals') },
        { path: '/activity', icon: '📋', label: t('nav.activity') },
      ],
    },
    {
      items: [
        { path: '/products', icon: '🏷️', label: t('nav.products') },
        { path: '/contracts', icon: '📄', label: t('nav.contracts') },
        { path: '/payments', icon: '📅', label: t('nav.payments') },
      ],
    },
    {
      items: [
        { path: '/users', icon: '👥', label: t('nav.users') },
        { path: '/transactions', icon: '💰', label: t('nav.transactions') },
        { path: '/settings', icon: '⚙️', label: t('nav.settings') },
      ],
    },
  ]

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          Molfi
          <span>{t('nav.adminPanel')}</span>
        </div>

        <nav className="sidebar-nav">
          {GROUPS.map((group, gi) => (
            <div
              key={gi}
              style={gi ? { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' } : undefined}
            >
              {group.items.map(item => (
                <button
                  key={item.path}
                  className={`nav-item ${pathname === item.path ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="lang-toggle">
            {LANGUAGES.map(({ code: lang }) => (
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
