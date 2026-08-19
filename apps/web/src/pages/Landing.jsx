import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useL } from '../i18n/landing'
import MolfiLogo from '../components/Logo'
import { store as ls, prefersLight } from '../utils/storage'

const THEME_KEY = 'molfi_landing_theme'

// An in-app link is a button, not an <a href>: a plain link would reload the
// whole bundle instead of routing
const link = (color) => ({
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color, fontSize: 'inherit', fontFamily: 'Inter, sans-serif', textDecoration: 'underline',
})
const TELEGRAM = 'https://t.me/molfi_bot'

const SOCIAL = [
  ['LinkedIn', 'M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13Zm1.78 13.02H3.55V9h3.57v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0Z'],
  ['Telegram', 'M21.5 4.3 2.9 11.5c-1.1.4-1.1 1.1-.2 1.4l4.6 1.4 1.8 5.4c.2.6.4.6.8.6.4 0 .6-.2.9-.5l2.2-2.1 4.5 3.3c.8.5 1.4.2 1.6-.8l3-14c.3-1.2-.5-1.8-1.6-1.4Z'],
  ['Instagram', 'M12 2.2c3.2 0 3.6 0 4.9.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.9c-.1 3.2-1.6 4.8-4.9 4.9-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-3.3-.2-4.8-1.7-4.9-4.9-.1-1.3-.1-1.7-.1-4.9s0-3.5.1-4.8C2.3 4 3.8 2.4 7.1 2.3c1.3-.1 1.7-.1 4.9-.1Zm0 4.9a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8Zm0 8.1a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Zm6.2-8.3a1.2 1.2 0 1 1-2.3 0 1.2 1.2 0 0 1 2.3 0Z'],
]

/**
 * The public root of molfi.uz.
 *
 * Lives inside the client app rather than as a separate build: there is one
 * domain, and a second build on it would need nginx in front of two bundles
 * while giving nothing back.
 *
 * Shown to signed-in users too — otherwise the site owner cannot open their own
 * page without logging out.
 */
export default function Landing() {
  const navigate = useNavigate()
  const { language, setLanguage, isAuthenticated } = useStore()
  const L = useL(language)

  // Theme: a saved choice beats the system one, but on a first visit there is
  // nothing to ask — take what the person already set in their system
  const [light, setLight] = useState(() => {
    const saved = ls.get(THEME_KEY)
    return saved ? saved === 'light' : prefersLight()
  })

  useEffect(() => {
    ls.set(THEME_KEY, light ? 'light' : 'dark')
  }, [light])

  const toApp = () => navigate(isAuthenticated ? '/catalog' : '/auth')

  const S = {
    bg: 'var(--land-bg)', surface: 'var(--land-surface)',
    border: 'var(--land-border)', accent: 'var(--land-accent)', gold: 'var(--land-gold)',
    text: 'var(--land-text)', muted: 'var(--land-muted)', dim: 'var(--land-dim)', on: 'var(--land-on)',
  }

  const card = { background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14, padding: 16 }
  const btn = {
    fontSize: 14, padding: '12px 26px', borderRadius: 10, border: 'none',
    background: S.accent, color: S.on, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  }
  const ghost = {
    ...btn, background: 'transparent', color: S.text,
    border: `1px solid ${S.border}`, fontWeight: 400,
  }
  const wrap = { maxWidth: 980, margin: '0 auto' }
  const section = { ...wrap, padding: '30px 20px', borderTop: `1px solid ${S.border}` }
  const h2 = { fontSize: 22, fontFamily: 'Unbounded, sans-serif', margin: 0 }

  return (
    <div
      className={`landing-root${light ? ' theme-light' : ''}`}
      style={{ background: S.bg, color: S.text, minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}
    >
      <header style={{
        ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '12px 20px', borderBottom: `1px solid ${S.border}`, flexWrap: 'wrap',
      }}>
        <MolfiLogo size={48} on={light ? 'light' : 'dark'} />

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {['en', 'uz', 'ru'].map(l => (
            <button
              key={l}
              onClick={() => setLanguage(l)}
              style={{
                fontSize: 12, padding: '5px 11px', borderRadius: 20, cursor: 'pointer',
                border: 'none', textTransform: 'uppercase', fontFamily: 'Inter, sans-serif',
                background: language === l ? `${S.accent}26` : 'transparent',
                color: language === l ? S.accent : S.muted,
              }}
            >
              {l}
            </button>
          ))}

          <button
            onClick={() => setLight(v => !v)}
            aria-label={light ? L.theme.toDark : L.theme.toLight}
            title={light ? L.theme.toDark : L.theme.toLight}
            style={{
              marginLeft: 4, width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
              border: `1px solid ${S.border}`, background: 'transparent', color: S.muted,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {light ? <MoonIcon /> : <SunIcon />}
          </button>

          <button onClick={toApp} style={{ ...btn, marginLeft: 8, fontSize: 13, padding: '8px 16px' }}>
            {L.nav.open}
          </button>
        </div>
      </header>

      <div style={{ ...wrap, padding: '52px 20px 44px', textAlign: 'center' }}>
        <h1 style={{
          fontSize: 'clamp(30px, 6.5vw, 42px)', fontFamily: 'Unbounded, sans-serif',
          lineHeight: 1.18, margin: 0,
        }}>
          {L.hero.title}
        </h1>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
          <button onClick={toApp} style={btn}>{L.hero.cta}</button>
          <a href="#how" style={{ ...ghost, textDecoration: 'none', display: 'inline-block' }}>
            {L.hero.secondary}
          </a>
        </div>
      </div>

      <div id="how" style={section}>
        <h2 style={{ ...h2, marginBottom: 16 }}>{L.steps.title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={card}>
              <div style={{ fontSize: 12, color: S.dim, marginBottom: 8 }}>{n}</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{L.steps['s' + n]}</div>
              <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.5, marginTop: 5 }}>
                {L.steps['s' + n + 'd']}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={section}>
        <h2 style={h2}>{L.models.title}</h2>
        <p style={{ fontSize: 14, color: S.muted, margin: '8px 0 18px' }}>{L.models.lead}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {[{ key: 'a', color: S.accent }, { key: 'b', color: S.gold }].map(({ key, color }) => (
            <div key={key} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Unbounded, sans-serif' }}>
                  {L.models[key]}
                </span>
              </div>
              <p style={{ fontSize: 13, color: S.muted, lineHeight: 1.6, margin: '10px 0 12px' }}>
                {L.models[key + 'Lead']}
              </p>
              {[1, 2, 3].map(n => (
                <div key={n} style={{ display: 'flex', gap: 9, fontSize: 13, padding: '4px 0' }}>
                  <span style={{ color, flexShrink: 0 }}>✓</span>
                  <span>{L.models[key + n]}</span>
                </div>
              ))}
              <div style={{
                fontSize: 12, color: S.dim, marginTop: 12, paddingTop: 12,
                borderTop: `1px solid ${S.border}`,
              }}>
                {L.models[key + 'For']}
              </div>
            </div>
          ))}
        </div>

        {/* The note about returns not being guaranteed stays on the page itself
            rather than only in the offer: the offer is opened after the decision */}
        <p style={{ fontSize: 12, color: S.dim, margin: '14px 0 0', lineHeight: 1.55 }}>
          {L.models.disclaimer}{' '}
          <button onClick={() => navigate('/offer')} style={link(S.accent)}>
            {L.models.offerLink}
          </button>.
        </p>
      </div>

      <div style={{ borderTop: `1px solid ${S.border}`, background: S.surface }}>
        <div style={{ ...wrap, padding: '30px 20px' }}>
          <h2 style={h2}>{L.app.title}</h2>
          <p style={{ fontSize: 14, color: S.muted, margin: '8px 0 16px' }}>{L.app.lead}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[1, 2, 3].map(n => (
              <div key={n} style={{ ...card, background: S.bg }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{L.app['a' + n]}</div>
                <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.5, marginTop: 5 }}>
                  {L.app['a' + n + 'd']}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={section}>
        <h2 style={{ ...h2, marginBottom: 10 }}>{L.farm.title}</h2>
        {/* No photo placeholders on purpose: three empty rectangles with emoji
            say "we have no real pictures" louder than their absence does.
            Once photos exist, the grid comes back here. */}
        <p style={{ fontSize: 14, color: S.muted, lineHeight: 1.62, margin: 0, maxWidth: 720 }}>
          {L.farm.body}
        </p>
      </div>

      <div style={section}>
        <h2 style={{ ...h2, marginBottom: 12 }}>{L.faq.title}</h2>
        {[1, 2, 3, 4, 5, 6].map(n => (
          <Faq key={n} q={L.faq['q' + n]} a={L.faq['a' + n]} open={n === 1} S={S} />
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${S.border}`, background: S.surface }}>
        <div style={{ ...wrap, padding: '36px 20px 30px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <MolfiLogo size={78} on={light ? 'light' : 'dark'} />
          </div>

          {/* The explanation of the name moved here from the cover: the reader has
              gone through the page and already knows what this is about */}
          <h2 style={{ ...h2, fontSize: 'clamp(22px, 4.5vw, 28px)', lineHeight: 1.2 }}>
            {L.footer.title1}<br />{L.footer.title2}
          </h2>
          <p style={{
            fontSize: 15, color: S.muted, maxWidth: 520,
            margin: '14px auto 0', lineHeight: 1.62,
          }}>
            {L.footer.lead}
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
            <button onClick={toApp} style={btn}>{L.footer.cta}</button>
            <a href={TELEGRAM} target="_blank" rel="noreferrer"
               style={{ ...ghost, textDecoration: 'none', display: 'inline-block' }}>
              {L.footer.telegram}
            </a>
          </div>

          {/* The links are empty for now: the accounts will be created later, and
              the space has to be laid out at once or the footer needs re-doing */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
            {SOCIAL.map(([name, d]) => (
              <a
                key={name} href="#" aria-label={name}
                onClick={e => e.preventDefault()}
                style={{
                  width: 34, height: 34, borderRadius: '50%', border: `1px solid ${S.border}`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: S.muted,
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={d} />
                </svg>
              </a>
            ))}
          </div>

          <div style={{
            display: 'flex', gap: 18, justifyContent: 'center', marginTop: 22,
            flexWrap: 'wrap', fontSize: 12,
          }}>
            <button onClick={() => navigate('/offer')} style={link(S.muted)}>{L.footer.offer}</button>
            <button onClick={() => navigate('/privacy')} style={link(S.muted)}>{L.footer.privacy}</button>
            <a href="mailto:hello@molfi.uz" style={{ color: S.muted, textDecoration: 'none' }}>
              {L.footer.contacts}
            </a>
          </div>

          <div style={{
            fontSize: 12, color: S.dim, marginTop: 18, paddingTop: 16,
            borderTop: `1px solid ${S.border}`, lineHeight: 1.7,
          }}>
            {L.footer.address}<br />
            © {new Date().getFullYear()} Molfi. {L.footer.rights}
          </div>
        </div>
      </div>
    </div>
  )
}

function Faq({ q, a, open: initial, S }) {
  const [open, setOpen] = useState(initial)
  return (
    <div style={{ borderBottom: `1px solid ${S.border}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12, padding: '14px 0', cursor: 'pointer', background: 'none', border: 'none',
          color: S.text, fontSize: 15, textAlign: 'left', fontFamily: 'Inter, sans-serif',
        }}
      >
        <span>{q}</span>
        <span style={{
          color: S.dim, fontSize: 18, flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
        }}>⌄</span>
      </button>
      {open && (
        <p style={{ fontSize: 14, color: S.muted, lineHeight: 1.65, margin: '0 0 14px', maxWidth: 720 }}>
          {a}
        </p>
      )}
    </div>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z"
            stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  )
}
