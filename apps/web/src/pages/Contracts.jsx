import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { api } from '../utils/api'
import { formatSum, formatShort } from '../utils/format'
import { Button } from '../components/ui'
import { gainPerMonth } from '../utils/animal'

const EMOJI = { sheep: '🐑', goat: '🐐', cattle: '🐄' }
const CLOSED = ['completed', 'cancelled', 'defaulted']

const STATUS_COLOR = {
  active: 'var(--color-success)', pending: 'var(--color-accent)',
  completed: 'var(--color-text-muted)', cancelled: 'var(--color-red)',
  defaulted: 'var(--color-red)',
}

const outstandingOf = (c) => Math.max(0,
  (Number(c.boarding_accrued_tiyin) || 0) - (Number(c.boarding_paid_tiyin) || 0))

export default function Contracts() {
  const navigate = useNavigate()
  const { language, contracts, fetchContracts, fetchBalance, balance } = useStore()
  const t = useT(language)

  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([fetchContracts(), fetchBalance()]).finally(() => setLoading(false))
  }, [])

  /**
   * Порядок: сначала то, что требует денег, потом живые договоры,
   * потом закрытые. Долг, спрятанный четвёртым в списке, превращается
   * в просрочку — а платит за неё клиент.
   */
  const sorted = useMemo(() => {
    const rank = (c) => {
      if (outstandingOf(c) > 0 && c.status === 'active') return 0
      if (CLOSED.includes(c.status)) return 2
      return 1
    }
    return [...contracts].sort((a, b) =>
      rank(a) - rank(b) || new Date(b.created_at) - new Date(a.created_at))
  }, [contracts])

  /** Итоги считаем по живым договорам: закрытые уже не «мои активы». */
  const totals = useMemo(() => {
    const live = contracts.filter(c => !CLOSED.includes(c.status))
    return {
      invested: live.reduce((s, c) => s + (Number(c.principal_tiyin) || 0), 0),
      // Стоимость сегодня есть только у инвестиции: у владения выход
      // мясом, складывать его в деньги значит обещать несуществующее
      worth: live.filter(c => c.model_type === 'investment')
        .reduce((s, c) => s + (Number(c.summary?.gross) || 0), 0),
      due: live.reduce((s, c) => s + outstandingOf(c), 0),
    }
  }, [contracts])

  const openPay = (c) => {
    setPaying(c)
    setAmount(String(Math.floor(outstandingOf(c) / 100)))
    setError(null)
  }

  const pay = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.post('/payments/boarding', {
        contract_id: paying.id,
        amount_tiyin: Math.round(Number(amount) * 100),
      })
      await Promise.all([fetchContracts(), fetchBalance()])
      setPaying(null)
    } catch (e) {
      const msg = String(e.message)
      setError(msg.includes('insufficient_balance') ? t.checkout.notEnough
        : msg.includes('nothing_to_pay') ? t.contracts.nothingToPay
        : t.common.error)
    }
    setBusy(false)
  }

  return (
    <div style={{ padding: '20px 16px 90px', fontFamily: 'Inter, sans-serif', color: 'var(--color-text)' }}>
      <h1 style={{ fontSize: 22, fontFamily: 'Unbounded, sans-serif', marginBottom: 16 }}>
        {t.nav.assets}
      </h1>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: 40 }}>
          {t.common.loading}
        </p>
      ) : contracts.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🐑</div>
          <p>{t.contracts.empty}</p>
          <div style={{ maxWidth: 240, margin: '16px auto 0' }}>
            <Button onClick={() => navigate('/catalog')}>{t.nav.catalog}</Button>
          </div>
        </div>
      ) : (
        <>
          {/* Сводка сверху: без неё «сколько у меня всего» приходится
              складывать в уме по карточкам */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 16, overflow: 'hidden', marginBottom: 14,
          }}>
            <Total value={formatShort(totals.invested, language)} label={t.contracts.totalInvested} />
            <Total
              value={totals.worth > 0 ? formatShort(totals.worth, language) : '—'}
              label={t.contracts.totalWorth}
              color={totals.worth > 0 ? 'var(--color-success)' : undefined}
            />
            <Total
              value={totals.due > 0 ? formatShort(totals.due, language) : '—'}
              label={t.contracts.totalDue}
              color={totals.due > 0 ? 'var(--color-accent)' : undefined}
              last
            />
          </div>

          {sorted.map(c => (
            <ContractCard
              key={c.id} c={c} t={t} language={language}
              onOpen={() => navigate(`/contracts/${c.id}`)}
              onPay={() => openPay(c)}
            />
          ))}
        </>
      )}

      {paying && (
        <div
          onClick={() => setPaying(null)}
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

            <Line label={t.contracts.boardingDue} value={formatSum(outstandingOf(paying), language)} />
            <Line label={t.checkout.balance} value={formatSum(balance, language)} last />

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
              onClick={() => setAmount(String(Math.floor(outstandingOf(paying) / 100)))}
              style={{
                background: 'none', border: 'none', color: 'var(--color-accent)',
                fontSize: 13, cursor: 'pointer', padding: '8px 0',
              }}
            >
              {t.contracts.payFull}
            </button>

            {error && <p style={{ color: 'var(--color-red)', fontSize: 13, margin: '4px 0' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Button loading={busy} disabled={!Number(amount)} onClick={pay}>
                {t.checkout.confirm}
              </Button>
              <Button variant="secondary" onClick={() => setPaying(null)}>{t.common.cancel}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ContractCard({ c, t, language, onOpen, onPay }) {
  const due = outstandingOf(c)
  const needsPay = due > 0 && c.status === 'active'
  const closed = CLOSED.includes(c.status)

  const title = c['title_' + language] || c.title_en || c.animal_name || t.models[c.model_type]
  const emoji = EMOJI[c.animal_species] || EMOJI.sheep
  const kg = (Number(c.animal_weight_g) || 0) / 1000
  const gain = gainPerMonth(c.weights)

  const isInvestment = c.model_type === 'investment'
  // Знаковый результат приходит с сервера: обрезанный по нулю profit
  // показывал бы убыток нулём
  const pnl = Number(c.summary?.pnl) || 0
  const worth = Number(c.summary?.gross) || 0

  const line = [
    kg > 0 ? `${kg.toFixed(1)} ${t.common.kg}` : null,
    gain != null
      ? `${gain > 0 ? '+' : ''}${gain.toFixed(1)} ${t.product.gainMonth}`
      : (kg > 0 ? t.contracts.noMeasurements : null),
  ].filter(Boolean).join(' · ')

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: `${needsPay ? 2 : 1}px solid ${needsPay ? 'var(--color-accent)' : 'var(--color-border)'}`,
      borderRadius: 16, padding: 14, marginBottom: 10,
      opacity: closed ? .65 : 1,
    }}>
      {/* Нажимается вся карточка: отдельная кнопка «подробнее» на каждой
          повторялась столько раз, сколько договоров, и съедала треть высоты */}
      <div
        onClick={onOpen}
        style={{ display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer' }}
      >
        <span style={{ fontSize: 24, lineHeight: 1 }} aria-hidden="true">{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {line || t.models[c.model_type]}
          </div>
        </div>
        {closed ? (
          <span style={{
            flexShrink: 0, fontSize: 11, padding: '4px 10px', borderRadius: 20,
            color: STATUS_COLOR[c.status], border: `1px solid ${STATUS_COLOR[c.status]}`,
          }}>
            {t.contracts['status' + c.status[0].toUpperCase() + c.status.slice(1)]}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-muted)', fontSize: 20, flexShrink: 0 }} aria-hidden="true">›</span>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 12,
        paddingTop: 11, borderTop: '1px solid var(--color-border)',
      }}>
        {needsPay ? (
          <>
            <Cell label={t.contracts.boardingDue}
                  value={formatSum(due, language)}
                  color="var(--color-accent)" big />
            <Button
              style={{ width: 'auto', padding: '10px 20px', fontSize: 14, flexShrink: 0 }}
              onClick={onPay}
            >
              {t.contracts.pay}
            </Button>
          </>
        ) : (
          <>
            <Cell label={t.contracts.invested} value={formatSum(c.principal_tiyin, language)} />
            {isInvestment && worth > 0 && !closed && (
              <>
                <Cell label={t.contracts.worthNow} value={formatSum(worth, language)} />
                <Cell
                  label={pnl < 0 ? t.contracts.loss : t.contracts.profit}
                  value={(pnl > 0 ? '+' : pnl < 0 ? '−' : '') + formatSum(Math.abs(pnl), language)}
                  color={pnl > 0 ? 'var(--color-success)'
                    : pnl < 0 ? 'var(--color-red)' : 'var(--color-text-muted)'}
                  right
                />
              </>
            )}
            {Number(c.payout_tiyin) > 0 && (
              <Cell label={t.contracts.paidOut} value={formatSum(c.payout_tiyin, language)}
                    color="var(--color-success)" right />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Cell({ label, value, color, big, right }) {
  return (
    <div style={{ flex: right ? '0 0 auto' : 1, minWidth: 0, textAlign: right ? 'right' : 'left' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{
        fontSize: big ? 17 : 14, fontWeight: big ? 700 : 600, color, marginTop: 2,
        fontFamily: big ? 'Unbounded, sans-serif' : undefined,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
    </div>
  )
}

function Total({ value, label, color, last }) {
  return (
    <div style={{
      padding: '13px 6px', textAlign: 'center',
      borderRight: last ? 'none' : '1px solid var(--color-border)',
    }}>
      <div style={{
        fontSize: 16, fontWeight: 700, fontFamily: 'Unbounded, sans-serif',
        color: color || 'var(--color-text)', lineHeight: 1.2,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function Line({ label, value, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '10px 0',
      borderBottom: last ? 'none' : '1px solid var(--color-border)',
    }}>
      <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 14 }}>{value}</span>
    </div>
  )
}
