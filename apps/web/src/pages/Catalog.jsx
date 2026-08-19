import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { formatSum } from '../utils/format'
import BalanceCard from '../components/BalanceCard'
import MolfiLogo from '../components/Logo'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { Card, Badge } from '../components/ui'

const ageMonths = (birthDate) => {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  return (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
}

/**
 * Projected value: weight × price per kilogram.
 * Computed on the client so the figure moves with the animal weight without a
 * round trip to the server. It is an estimate, and it is labelled as one.
 */
const projected = (p) => {
  const kg = (Number(p.animal_weight_g) || 0) / 1000
  return Math.round(kg * (Number(p.price_per_kg_tiyin) || 0))
}

function ProductCard({ p, language, t, onOpen }) {
  const age = ageMonths(p.birth_date)
  const worth = projected(p)
  const title = p['title_' + language] || p.title_en || p.animal_name

  return (
    <Card style={{ marginBottom: 12, cursor: 'pointer', padding: 0, overflow: 'hidden' }}>
      <div onClick={onOpen}>
        {p.animal_photo_url || p.photo_url ? (
          <img
            src={p.animal_photo_url || p.photo_url}
            alt={title}
            style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            height: 120, background: 'var(--color-surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42,
          }}>
            🐑
          </div>
        )}

        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3 }}>
                {[p.animal_breed, p.farm_name].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Badge variant="gold">{t.models[p.model_type]}</Badge>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 13, flexWrap: 'wrap' }}>
            {p.animal_weight_g > 0 && (
              <Stat label={t.product.weight} value={`${(p.animal_weight_g / 1000).toFixed(1)} ${t.common.kg}`} />
            )}
            {age !== null && (
              <Stat label={t.product.age} value={`${age} ${t.product.months}`} />
            )}
            {p.boarding_fee_monthly_tiyin > 0 && (
              <Stat
                label={t.product.boardingMonthly}
                value={formatSum(p.boarding_fee_monthly_tiyin, language)}
              />
            )}
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
            marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)',
          }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t.product.price}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Unbounded, sans-serif' }}>
                {formatSum(p.price_tiyin, language)}
              </div>
            </div>

            {/* The projection is shown only where the exit is a sale.
                In ownership the client takes the meat, so "what is it worth" is not about income. */}
            {p.model_type === 'investment' && worth > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t.product.projectedNow}</div>
                <div style={{
                  fontSize: 15, fontWeight: 600,
                  color: worth > p.price_tiyin ? 'var(--color-success)' : 'var(--color-text)',
                }}>
                  {formatSum(worth, language)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  )
}

export default function Catalog() {
  const navigate = useNavigate()
  const { language, products, models, fetchProducts, fetchModels, fetchBalance, fetchContracts } = useStore()
  const t = useT(language)
  const [tab, setTab] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // The balance card needs the contracts: without them it shows only free
    // money and says nothing about assets
    Promise.all([fetchModels(), fetchProducts(), fetchBalance(), fetchContracts()])
      .finally(() => setLoading(false))
  }, [])

  // The default tab is the first enabled model. Hardcoding it is not an option:
  // the model list comes from settings and can change without a deploy.
  useEffect(() => {
    if (!tab && models.length) setTab(models[0])
  }, [models, tab])

  const visible = tab ? products.filter(p => p.model_type === tab) : products

  return (
    <div style={{ padding: '20px 16px 90px', fontFamily: 'Inter, sans-serif', color: 'var(--color-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <MolfiLogo size={30} />
        <LanguageSwitcher />
      </div>

      <div style={{ marginBottom: 18 }}>
        <BalanceCard
          onTopUp={() => navigate('/wallet')}
          onWithdraw={() => navigate('/wallet')}
        />
      </div>

      {/* Model tabs. With a single model the tabs are just noise. */}
      {models.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, overflowX: 'auto' }}>
          {models.map(m => (
            <button
              key={m}
              onClick={() => setTab(m)}
              style={{
                padding: '10px 16px', borderRadius: 12, fontSize: 14, whiteSpace: 'nowrap',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                border: `1px solid ${tab === m ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: tab === m ? 'var(--color-accent)' : 'var(--color-surface)',
                color: tab === m ? 'var(--color-bg)' : 'var(--color-text-muted)',
                fontWeight: tab === m ? 700 : 500,
              }}
            >
              {t.models[m]}
            </button>
          ))}
        </div>
      )}

      {tab && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
          {t.models[tab + '_desc']}
        </p>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: 40 }}>
          {t.common.loading}
        </p>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🌾</div>
          {t.product.empty}
        </div>
      ) : (
        visible.map(p => (
          <ProductCard
            key={p.id}
            p={p}
            language={language}
            t={t}
            onOpen={() => navigate(`/product/${p.id}`)}
          />
        ))
      )}
    </div>
  )
}
