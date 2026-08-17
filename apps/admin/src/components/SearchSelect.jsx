import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Выпадающий список с поиском.
 *
 * Обычный <select> нормально работает на десятке вариантов и перестаёт
 * работать на сотне: остаётся только скроллить. Здесь можно набрать
 * часть имени, телефона или клички и попасть в нужную строку сразу.
 *
 * options: [{ value, label, hint?, search? }]
 *   label  — что видно в строке
 *   hint   — приглушённый текст справа (баланс, цена, статус)
 *   search — по чему искать, если этого нет в label (например телефон)
 */
export default function SearchSelect({
  value,
  onChange,
  options = [],
  placeholder = '',
  searchPlaceholder = '',
  emptyText = '—',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o =>
      `${o.label} ${o.hint || ''} ${o.search || ''}`.toLowerCase().includes(q)
    )
  }, [options, query])

  // Клик мимо закрывает список — иначе он остаётся висеть поверх формы
  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      // Фокус в поиск сразу: открыл — печатай, без лишнего клика
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Держим подсвеченную строку в поле зрения при навигации стрелками
  useEffect(() => {
    const el = listRef.current?.children[cursor]
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const pick = (opt) => {
    onChange(String(opt.value))
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[cursor]) pick(filtered[cursor])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="form-select"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: selected ? undefined : 'var(--muted)',
        }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.45)', overflow: 'hidden',
        }}>
          <input
            ref={inputRef}
            className="form-input"
            placeholder={searchPlaceholder}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onKeyDown}
            style={{ border: 'none', borderBottom: '1px solid var(--border)', borderRadius: 0 }}
          />

          <div ref={listRef} style={{ maxHeight: 260, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', color: 'var(--muted)', fontSize: 13 }}>
                {emptyText}
              </div>
            ) : filtered.map((o, i) => {
              const active = i === cursor
              const chosen = String(o.value) === String(value)
              return (
                <div
                  key={o.value}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(o)}
                  style={{
                    padding: '9px 14px', cursor: 'pointer', fontSize: 13,
                    display: 'flex', justifyContent: 'space-between', gap: 10,
                    background: active ? 'var(--surface-2, #171b26)' : 'transparent',
                    borderLeft: `2px solid ${chosen ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.label}
                  </span>
                  {o.hint && (
                    <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{o.hint}</span>
                  )}
                </div>
              )
            })}
          </div>

          {options.length > 12 && (
            <div style={{
              padding: '6px 14px', fontSize: 11, color: 'var(--muted)',
              borderTop: '1px solid var(--border)',
            }}>
              {filtered.length} / {options.length}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
