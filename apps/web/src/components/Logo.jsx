export function SheepIcon({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="55" rx="32" ry="26" fill="var(--color-text)" />
      <circle cx="28" cy="40" r="10" fill="var(--color-text)" />
      <circle cx="50" cy="34" r="11" fill="var(--color-text)" />
      <circle cx="72" cy="40" r="10" fill="var(--color-text)" />
      <circle cx="38" cy="58" r="9" fill="var(--color-text)" />
      <circle cx="62" cy="58" r="9" fill="var(--color-text)" />
      <ellipse cx="50" cy="58" rx="14" ry="12" fill="var(--color-green)" />
      <circle cx="44" cy="55" r="2.4" fill="var(--color-bg)" />
      <circle cx="56" cy="55" r="2.4" fill="var(--color-bg)" />
      <rect x="22" y="78" width="6" height="14" rx="3" fill="var(--color-green)" />
      <rect x="40" y="80" width="6" height="14" rx="3" fill="var(--color-green)" />
      <rect x="56" y="80" width="6" height="14" rx="3" fill="var(--color-green)" />
      <rect x="74" y="78" width="6" height="14" rx="3" fill="var(--color-green)" />
    </svg>
  )
}

export default function MolfiLogo({ size = 32 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <SheepIcon size={size} />
      <span style={{ fontFamily: "'Unbounded', sans-serif", fontSize: size * 0.6, fontWeight: 700, letterSpacing: -0.5 }}>
        <span style={{ color: 'var(--color-green-light)' }}>Mol</span>
        <span style={{ color: 'var(--color-accent)' }}>fi</span>
      </span>
    </div>
  )
}
