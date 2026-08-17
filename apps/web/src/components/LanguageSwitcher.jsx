import { useStore } from '../store'
import { LANGUAGES } from '../i18n'

// Один компонент на все три места. Раньше в Auth и Catalog стояли
// бинарные тумблеры ru↔uz, которыми третий язык не выразить,
// а в Profile — отдельный список из двух пунктов.
//
// variant="compact" — сегментированный переключатель в шапке
// variant="full"    — строка кнопок с названиями, для настроек профиля

export default function LanguageSwitcher({ variant = 'compact', style }) {
  const language = useStore(s => s.language)
  const setLanguage = useStore(s => s.setLanguage)

  const compact = variant === 'compact'

  return (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'flex',
        gap: compact ? 2 : 8,
        padding: compact ? 2 : 0,
        background: compact ? 'var(--color-surface-2)' : 'transparent',
        border: compact ? '1px solid var(--color-border)' : 'none',
        borderRadius: compact ? 12 : 0,
        ...style,
      }}
    >
      {LANGUAGES.map(lang => {
        const active = language === lang.code
        return (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            aria-pressed={active}
            style={{
              flex: compact ? '0 0 auto' : 1,
              padding: compact ? '5px 10px' : '12px 8px',
              borderRadius: compact ? 10 : 12,
              border: compact || active ? 'none' : '1px solid var(--color-border)',
              background: active
                ? (compact ? 'var(--color-accent)' : 'var(--color-green-light)')
                : (compact ? 'transparent' : 'var(--color-surface-2)'),
              color: active ? 'var(--color-bg)' : 'var(--color-text-muted)',
              fontWeight: active ? 700 : 500,
              fontSize: compact ? 12 : 14,
              lineHeight: 1.2,
              cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >
            {compact ? lang.code.toUpperCase() : lang.label}
          </button>
        )
      })}
    </div>
  )
}
