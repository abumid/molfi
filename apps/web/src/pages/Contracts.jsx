import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { api } from '../utils/api'
import { formatSum, formatDate } from '../utils/format'
import { Button, Card, Badge } from '../components/ui'

const STATUS_VARIANT = {
  active: 'active', pending: 'default', completed: 'default',
  cancelled: 'sold', defaulted: 'sold',
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
      <h1 style={{ fontSize: 22, fontFamily: 'Unbounded, sans-serif', marginBottom: 18 }}>
        {t.contracts.title}
      </h1>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginTop: 40 }}>
          {t.common.loading}
        </p>
      ) : contracts.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📄</div>
          <p>{t.contracts.empty}</p>
          <div style={{ maxWidth: 240, margin: '16px auto 0' }}>
            <Button onClick={() => navigate('/catalog')}>{t.nav.catalog}</Button>
          </div>
        </div>
      ) : (
        contracts.map(c => {
          const due = outstandingOf(c)
          const worth = Number(c.summary?.gross) || 0
          const profit = Number(c.summary?.profit) || 0
          const isInvestment = c.model_type === 'investment'
          const title = c['title_' + language] || c.title_en || c.animal_name

          return (
            <Card key={c.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                    {t.models[c.model_type]} · {t.contracts.opened} {formatDate(c.starts_at, language)}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[c.status] || 'default'}>
                  {t.contracts['status' + c.status[0].toUpperCase() + c.status.slice(1)]}
                </Badge>
              </div>

              <div style={{ marginTop: 12 }}>
                <Row label={t.contracts.invested} value={formatSum(c.principal_tiyin, language)} />

                {isInvestment && worth > 0 && (
                  <>
                    <Row label={t.contracts.worthNow} value={formatSum(worth, language)} />
                    <Row
                      label={profit > 0 ? t.contracts.profit : t.contracts.loss}
                      value={formatSum(profit, language)}
                      color={profit > 0 ? 'var(--color-success)' : 'var(--color-text-muted)'}
                    />
                  </>
                )}

                {Number(c.payout_tiyin) > 0 && (
                  <Row label={t.contracts.paidOut} value={formatSum(c.payout_tiyin, language)}
                       color="var(--color-success)" />
                )}

                {due > 0 && (
                  <Row label={t.contracts.boardingDue} value={formatSum(due, language)}
                       color="var(--color-accent)" />
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {due > 0 && (
                  <Button style={{ padding: '11px 16px', fontSize: 14 }} onClick={() => openPay(c)}>
                    {t.contracts.payBoarding}
                  </Button>
                )}
                {c.animal_id && (
                  <Button
                    variant="secondary"
                    style={{ padding: '11px 16px', fontSize: 14 }}
                    onClick={() => navigate(`/product/${c.product_id}`)}
                  >
                    {t.wallet.details}
                  </Button>
                )}
              </div>
            </Card>
          )
        })
      )}

      {paying && (
        <div
          onClick={() => setPaying(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-end', zIndex: 50,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)',
              borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20,
              width: '100%', boxSizing: 'border-box',
            }}
          >
            <h3 style={{ margin: '0 0 14px', fontFamily: 'Unbounded, sans-serif', fontSize: 17 }}>
              {t.contracts.payBoarding}
            </h3>

            <Row label={t.contracts.boardingDue} value={formatSum(outstandingOf(paying), language)} />
            <Row label={t.checkout.balance} value={formatSum(balance, language)} />

            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
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

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
      <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{label}</span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
    </div>
  )
}
