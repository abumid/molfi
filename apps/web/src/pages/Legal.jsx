import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { useLegal } from '../i18n/legal'
import MolfiLogo from '../components/Logo'

const THEME_KEY = 'molfi_landing_theme'

/**
 * Оферта и политика конфиденциальности.
 *
 * Страницы публичные и живут в палитре лендинга, а не приложения: на них
 * приходят по ссылке из подвала, ещё не войдя в аккаунт. Тема берётся та
 * же, что человек выбрал на лендинге, — переключать её заново он не должен.
 *
 * @param doc 'offer' или 'privacy'
 */
export default function Legal({ doc }) {
  const navigate = useNavigate()
  const { language } = useStore()
  const t = useT(language)
  const L = useLegal(language, doc)

  const [light, setLight] = useState(() => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved) return saved === 'light'
    return typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-color-scheme: light)').matches
  })

  useEffect(() => {
    localStorage.setItem(THEME_KEY, light ? 'light' : 'dark')
  }, [light])

  const S = {
    bg: 'var(--land-bg)', surface: 'var(--land-surface)', border: 'var(--land-border)',
    accent: 'var(--land-accent)', text: 'var(--land-text)',
    muted: 'var(--land-muted)', dim: 'var(--land-dim)',
  }

  return (
    <div
      className={`landing-root${light ? ' theme-light' : ''}`}
      style={{ background: S.bg, color: S.text, minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}
    >
      <header style={{
        maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, padding: '12px 20px',
        borderBottom: `1px solid ${S.border}`,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          aria-label="Molfi"
        >
          <MolfiLogo size={44} on={light ? 'light' : 'dark'} />
        </button>
        <button
          onClick={() => setLight(v => !v)}
          aria-label={light ? 'Dark theme' : 'Light theme'}
          style={{
            width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
            border: `1px solid ${S.border}`, background: 'transparent', color: S.muted,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}
        >
          {light ? '☾' : '☀'}
        </button>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '34px 20px 60px' }}>
        <h1 style={{ fontSize: 'clamp(24px, 5vw, 32px)', fontFamily: 'Unbounded, sans-serif', margin: 0 }}>
          {L.title}
        </h1>

        {/* Черновик подписан честно: документ не проходил юриста,
            и человек имеет право это знать до того, как на него сошлются */}
        <div style={{
          display: 'inline-block', marginTop: 12, padding: '6px 12px', borderRadius: 20,
          background: 'rgba(212,168,67,.15)', border: '1px solid var(--land-gold)',
          fontSize: 12, color: 'var(--land-gold)',
        }}>
          {L.updated}
        </div>

        <p style={{ fontSize: 15, color: S.muted, lineHeight: 1.65, margin: '18px 0 0', maxWidth: 640 }}>
          {L.intro}
        </p>

        <div style={{ marginTop: 28 }}>
          {L.s.map(([title, body], i) => (
            <section key={title} style={{
              padding: '18px 0',
              borderTop: i === 0 ? 'none' : `1px solid ${S.border}`,
            }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{title}</h2>
              <p style={{
                fontSize: 15, color: S.muted, lineHeight: 1.7, margin: '8px 0 0', maxWidth: 640,
              }}>
                {body}
              </p>
            </section>
          ))}
        </div>

        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: 28, padding: '11px 22px', borderRadius: 10, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${S.border}`, color: S.text,
            fontSize: 14, fontFamily: 'Inter, sans-serif',
          }}
        >
          ← {t.auth.back}
        </button>
      </div>
    </div>
  )
}
