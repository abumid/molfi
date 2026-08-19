/**
 * Three key numbers in a row, everything else behind a disclosure.
 *
 * Weight, age, price per kg and the RFID tag used to be identical grey lines —
 * the tag looked as important as the price. Here the top holds only what a
 * decision is made from; the rest is one tap away.
 */
import { useState } from 'react'

export function StatRow({ items }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`,
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 16, overflow: 'hidden',
    }}>
      {items.map((s, i) => (
        <div key={s.label} style={{
          padding: '14px 8px', textAlign: 'center',
          borderRight: i === items.length - 1 ? 'none' : '1px solid var(--color-border)',
        }}>
          <div style={{
            fontSize: 22, fontWeight: 700, fontFamily: 'Unbounded, sans-serif',
            color: s.color || 'var(--color-text)', lineHeight: 1.15,
          }}>
            {s.value}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Details({ rows, label, labelOpen }) {
  const [open, setOpen] = useState(false)
  const visible = rows.filter(r => r && r.value)
  if (!visible.length) return null

  return (
    <div style={{ marginTop: 10 }}>
      {open && (
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 14, padding: '6px 14px', marginBottom: 8,
        }}>
          {visible.map((r, i) => (
            <div key={r.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '9px 0',
              borderBottom: i === visible.length - 1 ? 'none' : '1px solid var(--color-border)',
            }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{r.label}</span>
              <span style={{ fontSize: 13, fontWeight: 500, fontFamily: r.mono ? 'monospace' : undefined }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '11px', borderRadius: 12, cursor: 'pointer',
          background: 'transparent', border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)', fontSize: 13, fontFamily: 'Inter, sans-serif',
        }}
      >
        {open ? labelOpen : label}
      </button>
    </div>
  )
}
