import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { api } from '../utils/api'

const C = {
  bg: 'var(--color-bg)', surface: 'var(--color-surface)', surface2: 'var(--color-surface-2)', border: 'var(--color-border)',
  accent: 'var(--color-green-light)', gold: 'var(--color-accent)', text: 'var(--color-text)', textMuted: 'var(--color-text-muted)', red: 'var(--color-red)',
}

const formatSum = (tiyin) => {
  const num = Number(tiyin) || 0
  return new Intl.NumberFormat('ru-UZ').format(Math.floor(num / 100)) + ' сум'
}

const tt = (lang, ru, uz) => (lang === 'uz' ? uz : ru)

const MIN_SHARE_PCT = 10
const PLATFORM_FEE_RATE = 0.03

function StatusBadge({ status, lang }) {
  const active = status === 'active'
  return (
    <span style={{
      padding: '4px 10px', borderRadius: 999, fontSize: 11,
      background: active ? '#3a9a3a22' : 'var(--color-red)22',
      color: active ? C.accent : C.red,
      border: `1px solid ${active ? '#3a9a3a44' : 'var(--color-red)44'}`,
    }}>
      {active ? tt(lang, 'Активен', 'Faol') : tt(lang, 'Продан', 'Sotildi')}
    </span>
  )
}

function Row({ label, value, valueColor, bold, big, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: big ? '12px 0' : '8px 0', borderBottom: last ? 'none' : `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 14, fontWeight: bold ? 700 : 400, color: C.text }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 14, fontWeight: bold || big ? 700 : 600, color: valueColor || C.text }}>{value}</span>
    </div>
  )
}

export default function BuyShare() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { balance, language, fetchBalance, fetchMyShares } = useStore()

  const [sheep, setSheep] = useState(null)
  const [percent, setPercent] = useState(10)
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchBalance()
    api.get(`/sheep/${id}`).then(d => {
      setSheep(d.sheep)
      const avail = d.sheep.total_shares - d.sheep.sold_shares
      setPercent(avail >= MIN_SHARE_PCT ? MIN_SHARE_PCT : avail)
    }).catch(console.error)
  }, [id])

  const availablePct = sheep ? sheep.total_shares - sheep.sold_shares : 0
  const pricePerPct = sheep ? Math.round(sheep.price_tiyin / 100) : 0
  const principal = pricePerPct * percent
  const platformFee = Math.round(principal * PLATFORM_FEE_RATE)
  const totalCost = principal + platformFee
  const canAfford = balance >= totalCost
  // Разрешаем купить меньше 10%, только если это ровно весь остаток —
  // иначе последние проценты барана никогда нельзя было бы продать.
  const isValid = availablePct > 0 && percent >= 1 && percent <= availablePct &&
    (percent >= MIN_SHARE_PCT || percent === availablePct)
  const sliderMin = availablePct >= MIN_SHARE_PCT ? MIN_SHARE_PCT : Math.max(1, availablePct)
  const quickOptions = [10, 20, 30, 50, availablePct].filter(
    (v, i, arr) => v <= availablePct && arr.indexOf(v) === i
  )

  const commitInput = () => {
    const val = parseInt(inputVal, 10)
    const valid = !isNaN(val) && val >= 1 && val <= availablePct && (val >= MIN_SHARE_PCT || val === availablePct)
    if (valid) {
      setPercent(val)
    } else {
      setInputVal(String(percent))
    }
    setEditing(false)
  }

  const handleBuy = async () => {
    if (!isValid || !canAfford || loading) return
    setLoading(true)
    setError('')
    try {
      await api.post('/shares/buy', {
        sheep_id: Number(id),
        share_pct: percent,
        payment_method: 'balance',
      })
      setSuccess(true)
      fetchBalance()
      fetchMyShares()
      setTimeout(() => navigate(`/sheep/${id}`), 2000)
    } catch (e) {
      setError(tt(language, 'Ошибка при покупке. Попробуйте снова.', "Xatolik yuz berdi. Qayta urinib ko'ring."))
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '20px 16px 140px', fontFamily: 'Inter, sans-serif', color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} style={{
          background: C.surface2, border: `1px solid ${C.border}`, color: C.text,
          width: 40, height: 40, borderRadius: 12, cursor: 'pointer', fontSize: 18,
        }}>←</button>
        <h1 style={{ fontSize: 18, fontFamily: 'Unbounded, sans-serif' }}>
          {tt(language, 'Купить долю', 'Ulush sotib olish')}
        </h1>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        {sheep === null ? (
          <p style={{ color: C.textMuted, textAlign: 'center' }}>{tt(language, 'Загрузка...', 'Yuklanmoqda...')}</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16 }}>🐑 {sheep.name}</strong>
              <StatusBadge status={sheep.status} lang={language} />
            </div>
            <div style={{ marginTop: 4, color: C.textMuted, fontSize: 13 }}>
              {sheep.breed} · {(sheep.current_weight_g / 1000).toFixed(1)} {tt(language, 'кг', 'kg')}
            </div>
            <div style={{ marginTop: 8, color: availablePct > 0 ? C.accent : C.red, fontSize: 12 }}>
              {tt(language, 'Доступно: ', 'Mavjud: ')}{availablePct}%
            </div>
          </>
        )}
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          {tt(language, 'Выберите долю', 'Ulush tanlang')}
        </div>
        <div style={{ padding: '8px 0' }}>
          {editing ? (
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <input
                type="number"
                value={inputVal}
                autoFocus
                onChange={e => setInputVal(e.target.value)}
                onBlur={commitInput}
                onKeyDown={e => { if (e.key === 'Enter') commitInput() }}
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  color: C.accent,
                  fontFamily: 'Unbounded, sans-serif',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${C.accent}`,
                  outline: 'none',
                  width: 160,
                  textAlign: 'center',
                  MozAppearance: 'textfield',
                }}
              />
              <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                {tt(language, 'Нажмите Enter или кликните в другое место', "Enter bosing yoki boshqa joyga bosing")}
              </div>
            </div>
          ) : (
            <div
              style={{ textAlign: 'center', marginBottom: 8, cursor: 'pointer' }}
              onClick={() => { setEditing(true); setInputVal(String(percent)) }}
              title={tt(language, 'Ввести вручную', "Qo'lda kiritish")}
            >
              <div style={{
                fontSize: 56,
                fontWeight: 700,
                color: C.accent,
                fontFamily: 'Unbounded, sans-serif',
                lineHeight: 1,
                borderBottom: `2px dashed ${C.border}`,
                display: 'inline-block',
                paddingBottom: 4,
                minWidth: 120,
              }}>
                {percent}%
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
                ✏️ {tt(language, 'Нажмите чтобы ввести вручную', "Qo'lda kiritish")}
              </div>
            </div>
          )}

          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 4, textAlign: 'center' }}>
            {tt(language, `Максимум: ${availablePct}%`, `Maksimal: ${availablePct}%`)}
          </div>
          {availablePct >= MIN_SHARE_PCT && (
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, textAlign: 'center' }}>
              {tt(language, `Минимальная доля: ${MIN_SHARE_PCT}%`, `Minimal ulush: ${MIN_SHARE_PCT}%`)}
            </div>
          )}

          <input
            type="range"
            min={sliderMin}
            max={availablePct > 0 ? availablePct : 1}
            step={1}
            value={percent}
            onChange={e => {
              setPercent(Number(e.target.value))
              setError('')
              setEditing(false)
            }}
            disabled={availablePct === 0}
            style={{ width: '100%', accentColor: C.accent, height: 6, cursor: 'pointer', marginBottom: 16 }}
          />

          {quickOptions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {quickOptions.map(val => (
                <button
                  key={val}
                  onClick={() => { setPercent(val); setError(''); setEditing(false) }}
                  style={{
                    flex: 1, minWidth: 48, padding: '10px 4px', borderRadius: 12,
                    border: percent === val ? 'none' : `1px solid ${C.border}`,
                    background: percent === val ? C.accent : C.surface2,
                    color: percent === val ? C.bg : C.textMuted,
                    fontWeight: percent === val ? 700 : 400,
                    fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {val === availablePct && ![10, 20, 30, 50].includes(val)
                    ? tt(language, 'Макс', 'Maks')
                    : `${val}%`}
                </button>
              ))}
            </div>
          )}
        </div>
        {availablePct === 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0', color: C.red }}>
            {tt(language, 'Все доли проданы', 'Barcha ulushlar sotildi')}
          </div>
        )}
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          {tt(language, 'Итого', 'Jami')}
        </div>
        <Row label={tt(language, 'Доля', 'Ulush')} value={`${percent}%`} />
        <Row label={tt(language, 'Цена за 1%', "1% narxi")} value={formatSum(pricePerPct)} valueColor={C.gold} />
        <Row label={tt(language, 'Стоимость доли', "Ulush narxi")} value={formatSum(principal)} />
        <Row label={tt(language, 'Комиссия платформы (3%)', "Platforma komissiyasi (3%)")} value={formatSum(platformFee)} />
        <Row label={tt(language, 'Итого к оплате', "To'lov summasi")} value={formatSum(totalCost)} valueColor={C.accent} bold big last />

        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
          <Row
            label={tt(language, 'Ваш баланс', 'Balansingiz')}
            value={formatSum(balance)}
            valueColor={canAfford ? C.accent : C.red}
            last
          />
        </div>
        {!canAfford && sheep !== null && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.red, textAlign: 'center' }}>
            {tt(language, 'Недостаточно средств. Пополните кошелёк.', "Mablag' yetarli emas. Hamyonni to'ldiring.")}
          </div>
        )}
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: C.bg, borderTop: `1px solid ${C.border}`,
        padding: 16, paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}>
        {success ? (
          <div style={{
            background: '#3a9a3a22', border: `1px solid ${C.accent}`, borderRadius: 12,
            padding: 16, textAlign: 'center', color: C.accent, fontWeight: 600,
          }}>
            {tt(language, '✓ Доля куплена! Переход...', '✓ Ulush sotib olindi!')}
          </div>
        ) : (
          <>
            <button
              onClick={handleBuy}
              disabled={!isValid || !canAfford || loading || availablePct === 0}
              style={{
                width: '100%', height: 52, borderRadius: 12, border: 'none',
                fontSize: 16, fontWeight: 700,
                background: (!isValid || !canAfford || loading || availablePct === 0) ? C.surface2 : C.accent,
                color: (!isValid || !canAfford || loading || availablePct === 0) ? C.textMuted : C.bg,
                cursor: (!isValid || !canAfford || loading || availablePct === 0) ? 'not-allowed' : 'pointer',
              }}
            >
              {loading
                ? tt(language, 'Обработка...', 'Jarayonda...')
                : `${tt(language, 'Купить ', 'Sotib olish ')}${percent}% · ${formatSum(totalCost)}`}
            </button>
            {error && <div style={{ marginTop: 8, textAlign: 'center', fontSize: 13, color: C.red }}>{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
