import { useState } from 'react'
import { formatDate } from '../utils/format'

/**
 * Weight chart on bare SVG — no charting library.
 * Pulling in recharts for a single polyline means adding 200 KB to the bundle
 * of a mobile app that loads over mobile data.
 *
 * The points are tappable: a static picture does not answer "and how much did
 * he weigh in May", which is the first question people ask.
 */
export default function WeightChart({ points, language, t }) {
  const [picked, setPicked] = useState(null)

  if (!points || !points.length) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t.product.noWeights}</p>
  }

  const data = [...points].reverse() // the server sends newest to oldest
  const W = 300, H = 96, PAD = 10
  const values = data.map(d => Number(d.weight_g) || 0)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const x = (i) => data.length === 1 ? W / 2 : PAD + i * (W - PAD * 2) / (data.length - 1)
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`

  const active = picked == null ? data.length - 1 : picked

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4,
      }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.product.weightChart}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text)' }}>
          {formatDate(data[active].recorded_at, language)} · {(values[active] / 1000).toFixed(1)} {t.common.kg}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 96, display: 'block' }}>
        <path d={area} fill="var(--color-green-light)" opacity="0.14" />
        <path d={line} fill="none" stroke="var(--color-green-light)" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={'d' + i} cx={x(i)} cy={y(values[i])} r={i === active ? 5 : 3}
                  fill="var(--color-green-light)" />
        ))}
        {/* Wider transparent circles: a finger cannot hit a radius-3 dot */}
        {data.map((d, i) => (
          <circle
            key={'h' + i} cx={x(i)} cy={y(values[i])} r="14" fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => setPicked(i)}
            onMouseEnter={() => setPicked(i)}
          />
        ))}
      </svg>
    </div>
  )
}
