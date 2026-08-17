import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { api } from '../utils/api'
import { formatSum, formatDate } from '../utils/format'
import { Button, Card, Badge } from '../components/ui'

const ACT_ICON = { feeding: '🌾', weighing: '⚖️', vet: '🩺', video: '🎥' }

const ageMonths = (d) => {
  if (!d) return null
  const b = new Date(d)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  return (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
}

/**
 * График веса на голом SVG — без библиотеки графиков.
 * Тянуть recharts ради одной ломаной значит добавить 200 КБ в бандл
 * мобильного приложения, которое и так грузится по узбекскому мобильному.
 */
function WeightChart({ points, language, t }) {
  if (!points.length) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t.product.noWeights}</p>
  }
  const data = [...points].reverse() // с сервера приходят от новых к старым
  const W = 300, H = 90, PAD = 4
  const values = data.map(d => Number(d.weight_g) || 0)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  const x = (i) => data.length === 1 ? W / 2 : PAD + i * (W - PAD * 2) / (data.length - 1)
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2)
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 90, display: 'block' }}>
        <path d={area} fill="var(--color-green-light)" opacity="0.15" />
        <path d={line} fill="none" stroke="var(--color-green-light)" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(values[i])} r="3" fill="var(--color-green-light)" />
        ))}
      </svg>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4,
      }}>
        <span>{formatDate(data[0].recorded_at, language)} · {(values[0] / 1000).toFixed(1)} {t.common.kg}</span>
        <span>{(values[values.length - 1] / 1000).toFixed(1)} {t.common.kg}</span>
      </div>
    </div>
  )
}

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { language } = useStore()
  const t = useT(language)

  const [product, setProduct] = useState(null)
  const [weights, setWeights] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/products/${id}`)
      .then(async (d) => {
        setProduct(d.product)
        setWeights(d.weights || [])
        // Лента живёт у животного, а не у оффера: у рассрочки животного нет
        if (d.product?.animal_id) {
          try {
            const a = await api.get(`/animals/${d.product.animal_id}/activity?limit=10`)
            setActivity(a.data?.items || [])
          } catch { /* лента необязательна, без неё страница работает */ }
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <Centered>{t.common.loading}</Centered>
  }
  if (error || !product) {
    return (
      <Centered>
        <div style={{ marginBottom: 16 }}>{t.common.error}</div>
        <Button variant="secondary" onClick={() => navigate('/catalog')}>{t.auth.back}</Button>
      </Centered>
    )
  }

  const title = product['title_' + language] || product.title_en || product.animal_name
  const description = product['description_' + language] || product.description_en
  const kg = (Number(product.animal_weight_g) || 0) / 1000
  const worth = Math.round(kg * (Number(product.price_per_kg_tiyin) || 0))
  const age = ageMonths(product.birth_date)
  const soldOut = product.status === 'sold_out' || product.slots_taken >= product.slots_total

  return (
    <div style={{ paddingBottom: 100, fontFamily: 'Inter, sans-serif', color: 'var(--color-text)' }}>
      {product.animal_photo_url || product.photo_url ? (
        <img src={product.animal_photo_url || product.photo_url} alt={title}
             style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{
          height: 180, background: 'var(--color-surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60,
        }}>🐑</div>
      )}

      <button
        onClick={() => navigate('/catalog')}
        style={{
          position: 'absolute', top: 16, left: 16, width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer',
        }}
      >←</button>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, margin: 0, fontFamily: 'Unbounded, sans-serif' }}>{title}</h1>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {[product.animal_breed, product.farm_name, product.farm_location].filter(Boolean).join(' · ')}
            </div>
          </div>
          <Badge variant="gold">{t.models[product.model_type]}</Badge>
        </div>

        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 12 }}>
          {t.models[product.model_type + '_desc']}
        </p>

        {description && (
          <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 12 }}>{description}</p>
        )}

        <Card style={{ marginTop: 16 }}>
          <Row label={t.product.price} value={formatSum(product.price_tiyin, language)} big />
          {kg > 0 && <Row label={t.product.weight} value={`${kg.toFixed(1)} ${t.common.kg}`} />}
          {age !== null && <Row label={t.product.age} value={`${age} ${t.product.months}`} />}
          {product.price_per_kg_tiyin > 0 && (
            <Row label={t.product.pricePerKg} value={formatSum(product.price_per_kg_tiyin, language)} />
          )}
          {product.boarding_fee_monthly_tiyin > 0 && (
            <Row label={t.product.boardingMonthly}
                 value={formatSum(product.boarding_fee_monthly_tiyin, language)} />
          )}
          {product.animal_rfid_tag && (
            <Row label={t.product.rfid} value={product.animal_rfid_tag} />
          )}
        </Card>

        {/* Прогноз только у инвестиции: у владения выход мясом, доход не считается */}
        {product.model_type === 'investment' && worth > 0 && (
          <Card style={{ marginTop: 12, borderColor: 'var(--color-green-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t.product.projectedNow}</span>
              <span style={{
                fontSize: 20, fontWeight: 700, fontFamily: 'Unbounded, sans-serif',
                color: worth > product.price_tiyin ? 'var(--color-success)' : 'var(--color-text)',
              }}>
                {formatSum(worth, language)}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '8px 0 0', lineHeight: 1.4 }}>
              {t.product.projectedHint}
            </p>
          </Card>
        )}

        {weights.length > 0 && (
          <Card style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>
              {t.product.weightChart}
            </div>
            <WeightChart points={weights} language={language} t={t} />
          </Card>
        )}

        {product.animal_id && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>
              {t.product.activity}
            </div>
            {activity.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t.product.noActivity}</p>
            ) : activity.map(a => (
              <Card key={a.id} style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20 }}>{ACT_ICON[a.type] || '•'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {a['title_' + language] || a.title_en || a.title_ru || a.type}
                  </div>
                  {(a['description_' + language] || a.description_en) && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                      {a['description_' + language] || a.description_en}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {formatDate(a.created_at, language)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, padding: 16,
        background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)',
      }}>
        <Button disabled={soldOut} onClick={() => navigate(`/product/${product.id}/checkout`)}>
          {soldOut ? t.product.sold : `${t.product.buy} · ${formatSum(product.price_tiyin, language)}`}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value, big }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0',
    }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: big ? 17 : 14, fontWeight: big ? 700 : 600 }}>{value}</span>
    </div>
  )
}

function Centered({ children }) {
  return (
    <div style={{
      minHeight: '70vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif', padding: 20,
    }}>
      {children}
    </div>
  )
}
