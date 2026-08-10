import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { api } from '../utils/api'

const C = {
  bg: 'var(--color-bg)', surface: 'var(--color-surface)', surface2: 'var(--color-surface-2)', border: 'var(--color-border)',
  accent: 'var(--color-green-light)', gold: 'var(--color-accent)', text: 'var(--color-text)', textMuted: 'var(--color-text-muted)', red: 'var(--color-red)',
}

const formatSum = (tiyin) => {
  if (!tiyin && tiyin !== 0) return '0 сум'
  return new Intl.NumberFormat('ru-UZ').format(Math.floor((tiyin || 0) / 100)) + ' сум'
}

const tt = (lang, ru, uz) => (lang === 'uz' ? uz : ru)

const FILTERS = [
  ['all', { ru: 'Все', uz: 'Hammasi' }],
  ['share_purchase', { ru: 'Инвестиции', uz: 'Investitsiyalar' }],
  ['payout', { ru: 'Выплаты', uz: "To'lovlar" }],
  ['topup', { ru: 'Пополнения', uz: "To'ldirishlar" }],
]

const txIcon = (type) => {
  if (type === 'share_purchase') return '📈'
  if (type === 'payout') return '💰'
  if (type === 'topup' || type === 'deposit') return '⬆️'
  return '⬇️'
}

const txColor = (type) => {
  if (type === 'payout' || type === 'topup' || type === 'deposit') return C.accent
  if (type === 'share_purchase' || type === 'withdrawal' || type === 'withdraw') return C.red
  return C.text
}

const txSign = (type) => (txColor(type) === C.accent ? '+' : '-')

function ModalSheet({ onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', zIndex: 50,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, borderTop: `1px solid ${C.border}`,
        borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, width: '100%',
        boxSizing: 'border-box',
      }}>
        {children}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', height: 44, borderRadius: 12, border: `1px solid ${C.border}`,
  background: C.surface2, color: C.text, padding: '0 14px', fontSize: 15, boxSizing: 'border-box',
}

export default function Wallet() {
  const navigate = useNavigate()
  const { balance, myShares, transactions, user, isAuthenticated, fetchTransactions, fetchBalance, fetchMyShares, language } = useStore()
  const [showTopup, setShowTopup] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [amount, setAmount] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (isAuthenticated && user) { fetchBalance(); fetchTransactions(); fetchMyShares() }
  }, [isAuthenticated, user])

  const frozenAmount = myShares.reduce((sum, x) => sum + (Number(x.purchase_price_tiyin) || 0), 0)
  const expectedPayout = frozenAmount * 0.15

  const filtered = filter === 'all' ? transactions : transactions.filter(tx => tx.type === filter)

  const handlePayMethod = () => alert(tt(language, 'Скоро появится', 'Tez orada'))

  return (
    <div style={{ padding: '20px 16px 90px', fontFamily: 'Inter, sans-serif', color: C.text }}>
      <h1 style={{ fontSize: 22, marginBottom: 20, fontFamily: 'Unbounded, sans-serif' }}>
        {tt(language, 'Кошелёк', 'Hamyon')}
      </h1>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <Row label={tt(language, 'Свободный баланс', 'Erkin balans')} value={formatSum(balance)} valueColor={C.text} big />
        <Row label={tt(language, 'Заморожено в долях', "Ulushlarda muzlatilgan")} value={formatSum(frozenAmount)} valueColor={C.gold} />
        <Row label={tt(language, 'Ожидается выплата', "Kutilayotgan to'lov")} value={formatSum(expectedPayout)} valueColor={C.accent} last />

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => setShowTopup(true)} style={{
            flex: 1, background: C.accent, color: C.bg, fontWeight: 600,
            height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 14,
          }}>
            {tt(language, 'Пополнить', "To'ldirish")}
          </button>
          <button onClick={() => setShowWithdraw(true)} style={{
            flex: 1, background: C.surface2, color: C.text,
            border: `1px solid ${C.border}`, height: 44, borderRadius: 12, cursor: 'pointer', fontSize: 14,
          }}>
            {tt(language, 'Вывести', 'Yechib olish')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        {FILTERS.map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: '8px 14px', borderRadius: 999, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer',
            border: `1px solid ${filter === key ? C.accent : C.border}`,
            background: filter === key ? '#3a9a3a22' : C.surface,
            color: filter === key ? C.accent : C.textMuted,
          }}>
            {label[language === 'uz' ? 'uz' : 'ru']}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        {filtered.length === 0 ? (
          <p style={{ color: C.textMuted, textAlign: 'center', marginTop: 20 }}>
            {tt(language, 'Транзакций пока нет', "Hozircha tranzaksiyalar yo'q")}
          </p>
        ) : filtered.map(txItem => (
          <div key={txItem.id} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 20 }}>{txIcon(txItem.type)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{txItem.description || txItem.type}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                {new Date(txItem.created_at).toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU')}
              </div>
            </div>
            <div style={{ fontWeight: 700, color: txColor(txItem.type) }}>
              {txSign(txItem.type)}{formatSum(txItem.amount_tiyin)}
            </div>
          </div>
        ))}
      </div>

      {myShares.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>
            {tt(language, 'ОЖИДАЕМЫЕ ВЫПЛАТЫ', "KUTILAYOTGAN TO'LOVLAR")}
          </div>
          {myShares.map(s => (
            <div key={s.id} style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: 14, marginBottom: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.sheep_name || s.name}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {tt(language, 'Доля: ', 'Ulush: ')}{s.share_pct}%
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>
                    {formatSum((s.purchase_price_tiyin || 0) * 0.15)}
                  </div>
                  <button onClick={() => navigate(`/sheep/${s.sheep_id}`)} style={{
                    marginTop: 4, background: 'none', border: 'none', color: C.textMuted,
                    fontSize: 12, cursor: 'pointer', padding: 0,
                  }}>
                    {tt(language, 'Подробнее →', "Batafsil →")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showTopup && (
        <ModalSheet onClose={() => setShowTopup(false)}>
          <h3 style={{ marginBottom: 12, fontFamily: 'Unbounded, sans-serif', fontSize: 16 }}>
            {tt(language, 'Пополнить баланс', "Balansni to'ldirish")}
          </h3>
          <input
            value={amount} onChange={e => setAmount(e.target.value)} type="number"
            placeholder={tt(language, 'Сумма', 'Summa')} style={inputStyle}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <button onClick={handlePayMethod} style={{
              height: 48, borderRadius: 12, border: 'none', background: '#0066FF',
              color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}>
              Click Pay
            </button>
            <button onClick={handlePayMethod} style={{
              height: 48, borderRadius: 12, border: 'none', background: '#00AAFF',
              color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}>
              Payme
            </button>
          </div>
        </ModalSheet>
      )}

      {showWithdraw && (
        <ModalSheet onClose={() => setShowWithdraw(false)}>
          <h3 style={{ marginBottom: 12, fontFamily: 'Unbounded, sans-serif', fontSize: 16 }}>
            {tt(language, 'Вывести средства', 'Mablag\' yechib olish')}
          </h3>
          <input
            value={amount} onChange={e => setAmount(e.target.value)} type="number"
            placeholder={tt(language, 'Сумма', 'Summa')} style={inputStyle}
          />
          <button onClick={handlePayMethod} style={{
            marginTop: 16, width: '100%', height: 48, borderRadius: 12, border: 'none',
            background: C.accent, color: C.bg, fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}>
            {tt(language, 'Вывести', 'Yechib olish')}
          </button>
        </ModalSheet>
      )}
    </div>
  )
}

function Row({ label, value, valueColor, big, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: last ? 'none' : `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 13, color: C.textMuted }}>{label}</span>
      <span style={{ fontSize: big ? 20 : 15, fontWeight: 700, color: valueColor, fontFamily: big ? 'Unbounded, sans-serif' : 'inherit' }}>
        {value}
      </span>
    </div>
  )
}
