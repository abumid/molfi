import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../../store'

function HomeIcon({ active }) {
  const color = active ? 'var(--color-green-light)' : 'var(--color-text-muted)'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M4 11l8-6 8 6v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8Z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" fill={active ? 'rgba(58,154,58,0.15)' : 'none'} />
      <path d="M9.5 20.5V14h5v6.5" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}

function CatalogIcon({ active }) {
  const color = active ? 'var(--color-green-light)' : 'var(--color-text-muted)'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" stroke={color} strokeWidth="1.7" fill={active ? 'rgba(58,154,58,0.15)' : 'none'} />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.5" stroke={color} strokeWidth="1.7" fill={active ? 'rgba(58,154,58,0.15)' : 'none'} />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.5" stroke={color} strokeWidth="1.7" fill={active ? 'rgba(58,154,58,0.15)' : 'none'} />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.5" stroke={color} strokeWidth="1.7" fill={active ? 'rgba(58,154,58,0.15)' : 'none'} />
    </svg>
  )
}

function WalletIcon({ active }) {
  const color = active ? 'var(--color-green-light)' : 'var(--color-text-muted)'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" stroke={color} strokeWidth="1.7" fill={active ? 'rgba(58,154,58,0.15)' : 'none'} />
      <path d="M14.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z" stroke={color} strokeWidth="1.7" />
      <path d="M3.5 9.5h17" stroke={color} strokeWidth="1.7" />
    </svg>
  )
}

function ProfileIcon({ active }) {
  const color = active ? 'var(--color-green-light)' : 'var(--color-text-muted)'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="1.7" fill={active ? 'rgba(58,154,58,0.15)' : 'none'} />
      <path d="M5 20c0-3.3 3.13-6 7-6s7 2.7 7 6" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

const NAV = [
  { path: '/catalog', labelRu: 'Главная', labelUz: 'Bosh sahifa', Icon: HomeIcon },
  { path: '/catalog?tab=available', labelRu: 'Каталог', labelUz: 'Katalog', Icon: CatalogIcon },
  { path: '/wallet', labelRu: 'Кошелёк', labelUz: 'Hamyon', Icon: WalletIcon },
  { path: '/profile', labelRu: 'Профиль', labelUz: 'Profil', Icon: ProfileIcon },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const language = useStore(s => s.language)

  const isActive = (item) => {
    if (item.path === '/catalog') {
      return (pathname === '/catalog' && search !== '?tab=available') ||
             pathname.startsWith('/sheep')
    }
    if (item.path === '/catalog?tab=available') {
      return pathname === '/catalog' && search === '?tab=available'
    }
    return pathname === item.path || pathname.startsWith(item.path)
  }

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430, background: 'var(--color-surface)',
      borderTop: '1px solid var(--color-border)', display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom)'
    }}>
      {NAV.map((item) => {
        const active = isActive(item)
        const label = language === 'uz' ? item.labelUz : item.labelRu
        const color = active ? 'var(--color-green-light)' : 'var(--color-text-muted)'
        return (
          <button key={item.path} onClick={() => navigate(item.path)} style={{
            flex: 1, padding: '10px 0 8px', background: 'none', border: 'none',
            color, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            cursor: 'pointer', fontSize: 11, fontFamily: 'Inter, sans-serif',
            fontWeight: active ? 600 : 400
          }}>
            <item.Icon active={active} />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
