import { formatDate } from '../utils/format'

const DOT = {
  feeding:  'var(--color-green-light)',
  weighing: 'var(--color-accent)',
  vet:      'var(--color-success)',
  video:    'var(--color-text-muted)',
}

/**
 * Лента ухода на вертикальной оси времени.
 *
 * Стопка одинаковых карточек не читается как хронология — глаз не видит,
 * что было раньше, а что позже. Нить с точками показывает это без слов.
 */
export default function ActivityFeed({ items, language, t }) {
  if (!items || !items.length) {
    return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t.product.noActivity}</p>
  }

  return (
    <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 18, marginLeft: 4 }}>
      {items.map((a, i) => (
        <div key={a.id} style={{ position: 'relative', paddingBottom: i === items.length - 1 ? 0 : 16 }}>
          <span style={{
            position: 'absolute', left: -23, top: 4, width: 9, height: 9, borderRadius: '50%',
            background: DOT[a.type] || 'var(--color-border)',
            border: '2px solid var(--color-bg)', boxSizing: 'content-box',
          }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>
            {a['title_' + language] || a.title_en || a.title_ru || a.type}
          </div>
          {(a['description_' + language] || a.description_en) && (
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.45 }}>
              {a['description_' + language] || a.description_en}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, opacity: .8 }}>
            {formatDate(a.created_at, language)}
          </div>
        </div>
      ))}
    </div>
  )
}
