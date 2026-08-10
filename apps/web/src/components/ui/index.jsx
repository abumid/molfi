export function Button({ children, onClick, variant = 'primary', loading, disabled, style }) {
  const styles = {
    primary: { background: 'var(--color-accent)', color: '#0a0f0a', fontWeight: 600 },
    secondary: { background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' },
    ghost: { background: 'transparent', color: 'var(--color-text-muted)' },
    danger: { background: 'var(--color-red)', color: '#fff', fontWeight: 600 },
  }
  return (
    <button onClick={onClick} disabled={disabled || loading} style={{
      width: '100%', padding: '14px 20px', borderRadius: 12, border: 'none',
      fontSize: 15, cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled || loading ? 0.6 : 1, fontFamily: 'Inter, sans-serif',
      transition: 'opacity 0.2s', ...styles[variant], ...style
    }}>
      {loading ? '...' : children}
    </button>
  )
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 16, padding: 16, ...style
    }}>
      {children}
    </div>
  )
}

export function Badge({ children, variant = 'default' }) {
  const colors = {
    default: { background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' },
    active: { background: 'rgba(111,207,74,0.15)', color: 'var(--color-accent)' },
    sold: { background: 'rgba(224,85,85,0.15)', color: 'var(--color-red)' },
    gold: { background: 'rgba(212,168,67,0.15)', color: 'var(--color-gold)' },
  }
  return (
    <span style={{
      padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
      ...colors[variant]
    }}>
      {children}
    </span>
  )
}

export function ProgressBar({ value, max = 100 }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ background: 'var(--color-surface-2)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-accent)', borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  )
}

export function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 48, height: 26, borderRadius: 13, cursor: 'pointer', position: 'relative',
      background: value ? 'var(--color-accent)' : 'var(--color-surface-2)',
      transition: 'background 0.2s', border: '1px solid var(--color-border)'
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 2, left: value ? 24 : 2, transition: 'left 0.2s'
      }} />
    </div>
  )
}

export function Input({ value, onChange, placeholder, type = 'text', style }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
      style={{
        width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--color-border)',
        background: 'var(--color-surface-2)', color: 'var(--color-text)', fontSize: 16,
        fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box', ...style
      }}
    />
  )
}
