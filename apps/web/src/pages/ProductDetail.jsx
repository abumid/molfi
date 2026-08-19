import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { api } from '../utils/api'
import { formatSum } from '../utils/format'
import { Button } from '../components/ui'
import AnimalHero from '../components/AnimalHero'
import WeightChart from '../components/WeightChart'
import ActivityFeed from '../components/ActivityFeed'
import { StatRow, Details } from '../components/AnimalStats'
import { ageMonths, gainPerMonth, placeLine } from '../utils/animal'

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { language } = useStore()
  const t = useT(language)

  const [product, setProduct] = useState(null)
  const [weights, setWeights] = useState([])
  const [activity, setActivity] = useState([])
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/products/${id}`)
      .then(async (d) => {
        setProduct(d.product)
        setWeights(d.weights || [])
        // The feed and videos belong to the animal, not to the offer: an
        // instalment has no animal. The endpoint returns the whole animal card.
        if (d.product?.animal_id) {
          try {
            const a = await api.get(`/animals/${d.product.animal_id}`)
            setActivity(a.activity || [])
            setVideos(a.videos || [])
          } catch { /* the feed is optional, the page works without it */ }
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Centered>{t.common.loading}</Centered>
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
  const gain = gainPerMonth(weights)
  const soldOut = product.status === 'sold_out' || product.slots_taken >= product.slots_total
  const isInvestment = product.model_type === 'investment'

  return (
    <div style={{ paddingBottom: 96, fontFamily: 'Inter, sans-serif', color: 'var(--color-text)' }}>
      <AnimalHero
        photo={product.animal_photo_url || product.photo_url}
        title={title}
        // The breed is not repeated: it is already in the offer title
        subtitle={placeLine(product.farm_name, product.farm_location)}
        species={product.animal_species}
        badge={t.models[product.model_type]}
        streamUrl={product.stream_url}
        videos={videos}
        onBack={() => navigate('/catalog')}
        t={t}
      />

      <div style={{ padding: '12px 16px 16px' }}>
        <StatRow items={[
          { value: kg > 0 ? kg.toFixed(1) : '—', label: t.product.kgNow },
          gain != null
            ? { value: (gain > 0 ? '+' : '') + gain.toFixed(1), label: t.product.gainMonth,
                color: gain > 0 ? 'var(--color-success)' : 'var(--color-text-muted)' }
            : { value: '—', label: t.product.gainMonth },
          { value: age != null ? age : '—', label: t.product.monthsOld },
        ]} />

        {/* The model is explained upfront and in plain words: the difference
            between investment and ownership is not a detail, it is the purchase */}
        <div style={{
          display: 'flex', gap: 11, alignItems: 'flex-start', marginTop: 12,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 14, padding: '12px 14px',
        }}>
          <InfoMark />
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            {t.models[product.model_type + '_desc']}
          </div>
        </div>

        {isInvestment && worth > 0 && (
          <div style={{
            marginTop: 12, background: 'var(--color-surface)',
            border: '1px solid var(--color-green-light)', borderRadius: 14, padding: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{t.product.projectedNow}</span>
              <span style={{
                fontSize: 19, fontWeight: 700, fontFamily: 'Unbounded, sans-serif',
                color: worth > product.price_tiyin ? 'var(--color-success)' : 'var(--color-text)',
              }}>
                {formatSum(worth, language)}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '8px 0 0', lineHeight: 1.45 }}>
              {t.product.projectedHint}
            </p>
          </div>
        )}

        {weights.length > 0 && (
          <div style={{
            marginTop: 12, background: 'var(--color-surface)',
            border: '1px solid var(--color-border)', borderRadius: 14, padding: 14,
          }}>
            <WeightChart points={weights} language={language} t={t} />
          </div>
        )}

        <Details
          label={t.product.allSpecs}
          labelOpen={t.product.hideSpecs}
          rows={[
            { label: t.product.breed, value: product.animal_breed },
            { label: t.product.farm, value: product.farm_name },
            { label: t.product.pricePerKg,
              value: product.price_per_kg_tiyin > 0 ? formatSum(product.price_per_kg_tiyin, language) : null },
            { label: t.product.boardingMonthly,
              value: product.boarding_fee_monthly_tiyin > 0
                ? formatSum(product.boarding_fee_monthly_tiyin, language) : null },
            { label: t.product.rfid, value: product.animal_rfid_tag, mono: true },
          ]}
        />

        {description && (
          <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 18, color: 'var(--color-text-muted)' }}>
            {description}
          </p>
        )}

        {product.animal_id && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              {t.product.activity}
            </div>
            <ActivityFeed items={activity} language={language} t={t} />
          </div>
        )}
      </div>

      {/* The price moved down next to the button: it used to sit at the top, and
          by the time the person scrolled to the action they no longer saw it */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, boxSizing: 'border-box',
        padding: '12px 16px', background: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t.product.price}</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Unbounded, sans-serif' }}>
            {formatSum(product.price_tiyin, language)}
          </div>
        </div>
        <Button
          disabled={soldOut}
          style={{ width: 'auto', padding: '13px 28px' }}
          onClick={() => navigate(`/product/${product.id}/checkout`)}
        >
          {soldOut ? t.product.sold : t.product.buy}
        </Button>
      </div>
    </div>
  )
}

function InfoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="12" cy="12" r="9.2" stroke="var(--color-text-muted)" strokeWidth="1.6" />
      <path d="M12 10.5v6" stroke="var(--color-text-muted)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.4" r="1.15" fill="var(--color-text-muted)" />
    </svg>
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
