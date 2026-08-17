import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { api } from '../utils/api'
import { formatSum, formatDate } from '../utils/format'
import { Button } from '../components/ui'
import AnimalHero from '../components/AnimalHero'
import WeightChart from '../components/WeightChart'
import ActivityFeed from '../components/ActivityFeed'
import { StatRow, Details } from '../components/AnimalStats'
import { ageMonths, gainPerMonth, placeLine } from '../utils/animal'

const STATUS_COLOR = {
  active: 'var(--color-success)', pending: 'var(--color-accent)',
  completed: 'var(--color-text-muted)', cancelled: 'var(--color-red)',
  defaulted: 'var(--color-red)',
}

/**
 * Экран отслеживания собственного животного.
 *
 * Отдельный от карточки товара сознательно: после покупки оффер уходит
 * в sold_out и исчезает с витрины, а владельцу именно с этого момента
 * и нужно следить — весь срок откорма.
 */
export default function ContractDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { language, balance, fetchBalance, fetchContracts } = useStore()
  const t = useT(language)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [payOpen, setPayOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [payError, setPayError] = useState(null)

  const load = () => api.get(`/contracts/${id}`).then(setData).catch(() => setError(true))

  useEffect(() => {
    Promise.all([load(), fetchBalance()]).finally(() => setLoading(false))
  }, [id])

  if (loading) return <Centered>{t.common.loading}</Centered>
  if (error || !data) {
    return (
      <Centered>
        <div style={{ marginBottom: 16 }}>{t.common.error}</div>
        <Button variant="secondary" onClick={() => navigate('/contracts')}>{t.auth.back}</Button>
      </Centered>
    )
  }

  const c = data.contract
  const title = c['title_' + language] || c.title_en || c.animal_name
  const description = c['description_' + language] || c.description_en

  const kgNow = (Number(c.animal_weight_g) || 0) / 1000
  const age = ageMonths(c.birth_date)
  const gain = gainPerMonth(data.weights)
  const isInvestment = c.model_type === 'investment'

  const due = Math.max(0,
    (Number(c.boarding_accrued_tiyin) || 0) - (Number(c.boarding_paid_tiyin) || 0))
  const worth = Number(data.summary?.gross) || 0
  // Знаковый результат, а не обрезанный по нулю profit: иначе убыток
  // печатается нулём, и владелец не понимает, потерял он что-то или нет
  const pnl = Number(data.summary?.pnl) || 0

  const statusLabel = t.contracts['status' + c.status[0].toUpperCase() + c.status.slice(1)]

  const openPay = () => {
    setAmount(String(Math.floor(due / 100)))
    setPayError(null)
    setPayOpen(true)
  }

  const pay = async () => {
    setBusy(true)
    setPayError(null)
    try {
      await api.post('/payments/boarding', {
        contract_id: c.id,
        amount_tiyin: Math.round(Number(amount) * 100),
      })
      await Promise.all([load(), fetchBalance(), fetchContracts()])
      setPayOpen(false)
    } catch (e) {
      const msg = String(e.message)
      setPayError(
        msg.includes('insufficient_balance') ? t.checkout.notEnough
        : msg.includes('nothing_to_pay') ? t.contracts.nothingToPay
        : t.common.error
      )
    }
    setBusy(false)
  }

  const payable = due > 0 && c.status === 'active'

  return (
    <div style={{ paddingBottom: payable ? 96 : 30, fontFamily: 'Inter, sans-serif', color: 'var(--color-text)' }}>
      <AnimalHero
        photo={c.animal_photo_url || c.photo_url}
        title={title}
        subtitle={placeLine(c.farm_name, c.farm_location)}
        species={c.animal_species}
        badge={c.status === 'active' ? `✓ ${t.contracts.yours}` : statusLabel}
        badgeColor={STATUS_COLOR[c.status]}
        streamUrl={c.stream_url}
        videos={data.videos}
        onBack={() => navigate('/contracts')}
        t={t}
      />

      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          {t.models[c.model_type]} · {t.contracts.contract} #{c.id} · {t.contracts.opened} {formatDate(c.starts_at, language)}
        </div>

        {!c.animal_id ? (
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 14, padding: 14, fontSize: 13, color: 'var(--color-text-muted)',
          }}>
            {t.contracts.noAnimalYet}
          </div>
        ) : (
          <StatRow items={[
            { value: kgNow > 0 ? kgNow.toFixed(1) : '—', label: t.product.kgNow },
            gain != null
              ? { value: (gain > 0 ? '+' : '') + gain.toFixed(1), label: t.product.gainMonth,
                  color: gain > 0 ? 'var(--color-success)' : 'var(--color-text-muted)' }
              : { value: '—', label: t.product.gainMonth },
            { value: age != null ? age : '—', label: t.product.monthsOld },
          ]} />
        )}

        {/* Долг за уход — единственное, что требует действия. Он идёт
            сразу под показателями, а не теряется в общем списке цифр */}
        {payable && (
          <div style={{
            marginTop: 12, background: 'var(--color-surface)',
            border: '1px solid var(--color-accent)', borderRadius: 14, padding: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.contracts.boardingDue}</div>
              <div style={{
                fontSize: 19, fontWeight: 700, fontFamily: 'Unbounded, sans-serif',
                color: 'var(--color-accent)', marginTop: 2,
              }}>
                {formatSum(due, language)}
              </div>
            </div>
            <Button style={{ width: 'auto', padding: '11px 18px', fontSize: 14 }} onClick={openPay}>
              {t.contracts.payBoarding}
            </Button>
          </div>
        )}

        {!payable && c.status === 'active' && Number(c.boarding_fee_monthly_tiyin) > 0 && (
          <div style={{
            marginTop: 12, background: 'var(--color-surface)',
            border: '1px solid var(--color-border)', borderRadius: 14, padding: '12px 14px',
            fontSize: 13, color: 'var(--color-success)',
          }}>
            ✓ {t.contracts.boardingUpToDate}
          </div>
        )}

        <div style={{
          marginTop: 12, background: 'var(--color-surface)',
          border: '1px solid var(--color-border)', borderRadius: 14, padding: '6px 14px',
        }}>
          <Row label={t.contracts.invested} value={formatSum(c.principal_tiyin, language)} />

          {isInvestment && worth > 0 && c.status === 'active' && (
            <>
              <Row label={t.contracts.worthNow} value={formatSum(worth, language)} big />
              <Row
                label={pnl < 0 ? t.contracts.loss : t.contracts.profit}
                value={(pnl > 0 ? '+' : pnl < 0 ? '−' : '') + formatSum(Math.abs(pnl), language)}
                color={pnl > 0 ? 'var(--color-success)'
                  : pnl < 0 ? 'var(--color-red)' : 'var(--color-text-muted)'}
              />
            </>
          )}

          {Number(c.final_sale_price_tiyin) > 0 && (
            <Row label={t.contracts.soldFor} value={formatSum(c.final_sale_price_tiyin, language)} />
          )}
          {Number(c.payout_tiyin) > 0 && (
            <Row label={t.contracts.paidOut} value={formatSum(c.payout_tiyin, language)}
                 color="var(--color-success)" />
          )}
          {c.exit_type && (
            <Row label={t.checkout.exitLabel}
                 value={c.exit_type === 'sale' ? t.checkout.exitSale : t.checkout.exitMeat} last />
          )}
        </div>

        {isInvestment && c.status === 'active' && (
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '10px 2px 0', lineHeight: 1.45 }}>
            {t.product.projectedHint}
          </p>
        )}

        {c.animal_id && data.weights?.length > 0 && (
          <div style={{
            marginTop: 12, background: 'var(--color-surface)',
            border: '1px solid var(--color-border)', borderRadius: 14, padding: 14,
          }}>
            <WeightChart points={data.weights} language={language} t={t} />
          </div>
        )}

        <Details
          label={t.product.allSpecs}
          labelOpen={t.product.hideSpecs}
          rows={[
            { label: t.product.breed, value: c.animal_breed },
            { label: t.product.farm, value: c.farm_name },
            { label: t.product.pricePerKg,
              value: c.price_per_kg_tiyin > 0 ? formatSum(c.price_per_kg_tiyin, language) : null },
            { label: t.product.boardingMonthly,
              value: Number(c.boarding_fee_monthly_tiyin) > 0
                ? formatSum(c.boarding_fee_monthly_tiyin, language) : null },
            { label: t.contracts.boardingPaidTotal,
              value: Number(c.boarding_paid_tiyin) > 0
                ? formatSum(c.boarding_paid_tiyin, language) : null },
            { label: t.product.rfid, value: c.animal_rfid_tag, mono: true },
          ]}
        />

        {description && (
          <p style={{ fontSize: 14, lineHeight: 1.55, marginTop: 18, color: 'var(--color-text-muted)' }}>
            {description}
          </p>
        )}

        {c.animal_id && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
              {t.product.activity}
            </div>
            <ActivityFeed items={data.activity} language={language} t={t} />
          </div>
        )}
      </div>

      {payable && (
        <div style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 430, boxSizing: 'border-box',
          padding: '12px 16px', background: 'var(--color-bg)',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t.contracts.boardingDue}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Unbounded, sans-serif' }}>
              {formatSum(due, language)}
            </div>
          </div>
          <Button style={{ width: 'auto', padding: '13px 24px' }} onClick={openPay}>
            {t.contracts.payBoarding}
          </Button>
        </div>
      )}

      {payOpen && (
        <div
          onClick={() => setPayOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'flex-end', zIndex: 50,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)',
              borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20,
              width: '100%', maxWidth: 430, margin: '0 auto', boxSizing: 'border-box',
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontFamily: 'Unbounded, sans-serif', fontSize: 17 }}>
              {t.contracts.payBoarding}
            </h3>

            <Row label={t.contracts.boardingDue} value={formatSum(due, language)} />
            <Row label={t.checkout.balance} value={formatSum(balance, language)} last />

            <input
              type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={t.contracts.amount}
              style={{
                width: '100%', height: 46, marginTop: 12, borderRadius: 12,
                border: '1px solid var(--color-border)', background: 'var(--color-surface-2)',
                color: 'var(--color-text)', padding: '0 14px', fontSize: 16, boxSizing: 'border-box',
              }}
            />
            <button
              onClick={() => setAmount(String(Math.floor(due / 100)))}
              style={{
                background: 'none', border: 'none', color: 'var(--color-accent)',
                fontSize: 13, cursor: 'pointer', padding: '8px 0',
              }}
            >
              {t.contracts.payFull}
            </button>

            {payError && (
              <p style={{ color: 'var(--color-red)', fontSize: 13, margin: '4px 0' }}>{payError}</p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Button loading={busy} disabled={!Number(amount)} onClick={pay}>
                {t.checkout.confirm}
              </Button>
              <Button variant="secondary" onClick={() => setPayOpen(false)}>{t.common.cancel}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, color, big, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--color-border)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{
        fontSize: big ? 17 : 14, fontWeight: big ? 700 : 500, color,
        fontFamily: big ? 'Unbounded, sans-serif' : undefined,
      }}>
        {value}
      </span>
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
