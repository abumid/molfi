import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { api } from '../utils/api'
import { formatSum } from '../utils/format'
import { Button, Card } from '../components/ui'

export default function Checkout() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { language, balance, fetchBalance, fetchContracts } = useStore()
  const t = useT(language)

  const [product, setProduct] = useState(null)
  const [exitType, setExitType] = useState('slaughter')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get(`/products/${id}`).then(d => setProduct(d.product)),
      fetchBalance(),
    ]).catch(() => setError(t.common.error)).finally(() => setLoading(false))
  }, [id])

  if (loading) return <Centered>{t.common.loading}</Centered>
  if (!product) return <Centered>{t.common.error}</Centered>

  const price = Number(product.price_tiyin) || 0
  // The purchase fee is zero right now, but the field stays: switch it on in
  // settings and the screen shows it by itself, with no code change
  const fee = 0
  const total = price + fee
  const enough = balance >= total
  const isInvestment = product.model_type === 'investment'
  const title = product['title_' + language] || product.title_en || product.animal_name

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      // The new contract id is needed right away: from this screen the person
      // goes straight to their animal, not to a general list
      const res = await api.post('/contracts', {
        product_id: product.id,
        ...(product.model_type === 'ownership' ? { exit_type: exitType } : {}),
      })
      await Promise.all([fetchBalance(), fetchContracts()])
      setDone(res.contract)
    } catch (e) {
      const msg = String(e.message)
      setError(
        msg.includes('insufficient_balance') ? t.checkout.notEnough
        : msg.includes('animal_already_sold') ? t.product.sold
        : t.common.error
      )
    }
    setSaving(false)
  }

  if (done) {
    return (
      <Centered>
        <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
        <h2 style={{ fontFamily: 'Unbounded, sans-serif', fontSize: 20, margin: 0 }}>{t.checkout.done}</h2>
        <p style={{ textAlign: 'center', margin: '10px 0 24px', maxWidth: 320 }}>{t.checkout.doneText}</p>
        <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Leads to the card of the animal just bought. This used to throw the
              user into the profile, where the animal is not — they lost sight of
              it at exactly the moment they paid for it. */}
          <Button onClick={() => navigate(`/contracts/${done.id}`, { replace: true })}>
            {done.animal_id ? t.contracts.track : t.checkout.toContracts}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/catalog')}>{t.nav.catalog}</Button>
        </div>
      </Centered>
    )
  }

  return (
    <div style={{ padding: '20px 16px 110px', fontFamily: 'Inter, sans-serif', color: 'var(--color-text)' }}>
      <button
        onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: 16, cursor: 'pointer', padding: 0, marginBottom: 16 }}
      >← {t.auth.back}</button>

      <h1 style={{ fontSize: 22, fontFamily: 'Unbounded, sans-serif', margin: '0 0 4px' }}>
        {t.checkout.title}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: '0 0 18px' }}>{title}</p>

      <Card>
        <Row label={t.checkout.price} value={formatSum(price, language)} />
        {fee > 0 && <Row label={t.checkout.fee} value={formatSum(fee, language)} />}
        <div style={{ borderTop: '1px solid var(--color-border)', margin: '8px 0' }} />
        <Row label={t.checkout.total} value={formatSum(total, language)} big />
        <Row label={t.checkout.balance} value={formatSum(balance, language)} />
        <Row
          label={t.checkout.after}
          value={formatSum(Math.max(0, balance - total), language)}
          color={enough ? undefined : 'var(--color-red)'}
        />
      </Card>

      {product.boarding_fee_monthly_tiyin > 0 && (
        <Card style={{ marginTop: 12 }}>
          <Row label={t.checkout.boarding}
               value={formatSum(product.boarding_fee_monthly_tiyin, language)} />
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
            {t.checkout.boardingNote}
          </p>
        </Card>
      )}

      {/* In ownership the client decides whether to take it live or as meat.
          In investment there is one exit — a sale — so there is nothing to pick. */}
      {product.model_type === 'ownership' ? (
        <Card style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>
            {t.checkout.chooseExit}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['slaughter', t.checkout.exitMeat], ['sale', t.checkout.exitSale]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setExitType(v)}
                style={{
                  flex: 1, padding: '12px 8px', borderRadius: 12, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  border: exitType === v ? 'none' : '1px solid var(--color-border)',
                  background: exitType === v ? 'var(--color-green-light)' : 'var(--color-surface-2)',
                  color: exitType === v ? 'var(--color-bg)' : 'var(--color-text-muted)',
                  fontWeight: exitType === v ? 700 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <Card style={{ marginTop: 12 }}>
          <Row label={t.checkout.exitLabel} value={t.checkout.exitSale} />
        </Card>
      )}

      {/* The disclaimer is required and deliberately not hidden in small print at
          the bottom: a promised return is an obligation you answer for with money */}
      {isInvestment && (
        <p style={{
          fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5,
          marginTop: 16, padding: 12, background: 'var(--color-surface-2)', borderRadius: 12,
        }}>
          {t.checkout.terms}
        </p>
      )}

      {error && (
        <p style={{ color: 'var(--color-red)', fontSize: 13, marginTop: 14 }}>{error}</p>
      )}

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, padding: 16,
        background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)',
      }}>
        {enough ? (
          <Button loading={saving} onClick={confirm}>
            {t.checkout.confirm} · {formatSum(total, language)}
          </Button>
        ) : (
          <>
            <p style={{ color: 'var(--color-red)', fontSize: 13, margin: '0 0 10px', textAlign: 'center' }}>
              {t.checkout.notEnough}
            </p>
            <Button variant="secondary" onClick={() => navigate('/wallet')}>{t.checkout.topUp}</Button>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, big, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0' }}>
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 14, fontWeight: big ? 700 : 600, color }}>{value}</span>
    </div>
  )
}

function Centered({ children }) {
  return (
    <div style={{
      minHeight: '80vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 20,
      color: 'var(--color-text)', fontFamily: 'Inter, sans-serif',
    }}>
      {children}
    </div>
  )
}
