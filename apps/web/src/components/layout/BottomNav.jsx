import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../../store'
import { useT } from '../../i18n'

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

function AssetsIcon({ active }) {
  const color = active ? 'var(--color-green-light)' : 'var(--color-text-muted)'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M6 10.5c0-2.2 2.7-4 6-4s6 1.8 6 4v4.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4.5Z"
            stroke={color} strokeWidth="1.7" strokeLinejoin="round"
            fill={active ? 'rgba(58,154,58,0.15)' : 'none'} />
      <path d="M9 17v3M15 17v3" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M6 9.5C4.9 9.5 4 8.6 4 7.5S4.9 5.5 6 5.5M18 9.5c1.1 0 2-.9 2-2s-.9-2-2-2"
            stroke={color} strokeWidth="1.7" strokeLinecap="round" />
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

// «Мои активы» — обязательная вкладка, а не удобство: после покупки оффер
// уходит в sold_out и исчезает с витрины, и без этого входа владелец
// теряет своё животное из виду.
const NAV = [
  { path: '/catalog', key: 'catalog', Icon: CatalogIcon },
  { path: '/contracts', key: 'assets', Icon: AssetsIcon, badge: true },
  { path: '/wallet', key: 'wallet', Icon: WalletIcon },
  { path: '/profile', key: 'profile', Icon: ProfileIcon },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const language = useStore(s => s.language)
  const contracts = useStore(s => s.contracts)
  const t = useT(language)

  // Точка на вкладке, когда есть неоплаченный уход. Долг по содержанию —
  // единственное, что требует действия клиента, и он не должен узнавать
  // о нём из просрочки.
  const owes = contracts.some(c =>
    c.status === 'active' &&
    (Number(c.boarding_accrued_tiyin) || 0) > (Number(c.boarding_paid_tiyin) || 0))

  const isActive = (item) =>
    pathname === item.path || pathname.startsWith(item.path + '/')

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430, background: 'var(--color-surface)',
      borderTop: '1px solid var(--color-border)', display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom)'
    }}>
      {NAV.map((item) => {
        const active = isActive(item)
        const label = t.nav[item.key]
        const color = active ? 'var(--color-green-light)' : 'var(--color-text-muted)'
        return (
          <button key={item.path} onClick={() => navigate(item.path)} style={{
            flex: 1, padding: '10px 0 8px', background: 'none', border: 'none',
            color, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            cursor: 'pointer', fontSize: 11, fontFamily: 'Inter, sans-serif',
            fontWeight: active ? 600 : 400
          }}>
            <span style={{ position: 'relative', lineHeight: 0 }}>
              <item.Icon active={active} />
              {item.badge && owes && (
                <span style={{
                  position: 'absolute', top: -1, right: -1, width: 8, height: 8,
                  borderRadius: '50%', background: 'var(--color-accent)',
                  border: '2px solid var(--color-surface)', boxSizing: 'content-box',
                }} />
              )}
            </span>
            {label}
          </button>
        )
      })}
    </nav>
  )
}
