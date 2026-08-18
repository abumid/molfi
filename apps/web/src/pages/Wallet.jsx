import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { formatSum, formatDate } from '../utils/format'
import BalanceCard from '../components/BalanceCard'

const C = {
  bg: 'var(--color-bg)', surface: 'var(--color-surface)', surface2: 'var(--color-surface-2)', border: 'var(--color-border)',
  accent: 'var(--color-green-light)', gold: 'var(--color-accent)', text: 'var(--color-text)', textMuted: 'var(--color-text-muted)', red: 'var(--color-red)',
}

const FILTERS = [
  ['all', 'filter_all'],
  ['contract_purchase', 'filter_investments'],
  ['payout', 'filter_payouts'],
  ['topup', 'filter_topups'],
]

// Расход или приход. Список совпадает с INCOME_TYPES на бэкенде —
// если разъедется, знак в истории будет врать.
const INCOME = ['payout', 'topup', 'deposit']

const txIcon = (type) => {
  if (type === 'contract_purchase') return '📈'
  if (type === 'boarding_payment') return '🌾'
  if (type === 'installment_payment') return '📅'
  if (type === 'payout') return '💰'
  if (type === 'topup' || type === 'deposit') return '⬆️'
  return '⬇️'
}

const txColor = (type) => (INCOME.includes(type) ? C.accent : C.red)
const txSign = (type) => (INCOME.includes(type) ? '+' : '−')

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
  const { contracts, transactions, user, isAuthenticated, fetchTransactions, fetchBalance, fetchContracts, language } = useStore()
  const [showTopup, setShowTopup] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [amount, setAmount] = useState('')
  const [filter, setFilter] = useState('all')
  const t = useT(language)

  useEffect(() => {
    if (isAuthenticated && user) { fetchBalance(); fetchTransactions(); fetchContracts() }
  }, [isAuthenticated, user])

  const active = contracts.filter(c => c.status === 'active')
  const filtered = filter === 'all' ? transactions : transactions.filter(tx => tx.type === filter)

  const handlePayMethod = () => alert(t.wallet.coming_soon)

  return (
    <div style={{ padding: '20px 16px 90px', fontFamily: 'Inter, sans-serif', color: C.text }}>
      <h1 style={{ fontSize: 22, marginBottom: 20, fontFamily: 'Unbounded, sans-serif' }}>
        {t.wallet.title}
      </h1>

      {/* Та же карточка, что на каталоге: числа обязаны совпадать,
          а два похожих блока разъезжаются при первой же правке */}
      <div style={{ marginBottom: 16 }}>
        <BalanceCard
          onTopUp={() => setShowTopup(true)}
          onWithdraw={() => setShowWithdraw(true)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        {FILTERS.map(([key, labelKey]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: '8px 14px', borderRadius: 999, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer',
            border: `1px solid ${filter === key ? C.accent : C.border}`,
            background: filter === key ? '#3a9a3a22' : C.surface,
            color: filter === key ? C.accent : C.textMuted,
          }}>
            {t.wallet[labelKey]}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        {filtered.length === 0 ? (
          <p style={{ color: C.textMuted, textAlign: 'center', marginTop: 20 }}>
            {t.wallet.no_transactions}
          </p>
        ) : filtered.map(txItem => (
          <div key={txItem.id} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 20 }}>{txIcon(txItem.type)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {t.tx[txItem.type] || txItem.description || txItem.type}
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                {formatDate(txItem.created_at, language)}
              </div>
            </div>
            <div style={{ fontWeight: 700, color: txColor(txItem.type) }}>
              {txSign(txItem.type)}{formatSum(Math.abs(Number(txItem.amount_tiyin)), language)}
            </div>
          </div>
        ))}
      </div>

      {active.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>
            {t.contracts.title.toUpperCase()}
          </div>
          {active.map(c => {
            const due = Math.max(0,
              (Number(c.boarding_accrued_tiyin) || 0) - (Number(c.boarding_paid_tiyin) || 0))
            return (
              <div key={c.id} style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
                padding: 14, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {c['title_' + language] || c.title_en || c.animal_name}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                      {t.models[c.model_type]}
                      {due > 0 && (
                        <span style={{ color: C.gold }}> · {t.contracts.boardingDue} {formatSum(due, language)}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>
                      {formatSum(c.model_type === 'investment'
                        ? (Number(c.summary?.net) || 0)
                        : (Number(c.principal_tiyin) || 0), language)}
                    </div>
                    <button onClick={() => navigate(`/contracts/${c.id}`)} style={{
                      marginTop: 4, background: 'none', border: 'none', color: C.textMuted,
                      fontSize: 12, cursor: 'pointer', padding: 0,
                    }}>
                      {t.wallet.details}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showTopup && (
        <ModalSheet onClose={() => setShowTopup(false)}>
          <h3 style={{ marginBottom: 12, fontFamily: 'Unbounded, sans-serif', fontSize: 16 }}>
            {t.wallet.topup_title}
          </h3>
          <input
            value={amount} onChange={e => setAmount(e.target.value)} type="number"
            placeholder={t.wallet.amount_placeholder} style={inputStyle}
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
            {t.wallet.withdraw_title}
          </h3>
          <input
            value={amount} onChange={e => setAmount(e.target.value)} type="number"
            placeholder={t.wallet.amount_placeholder} style={inputStyle}
          />
          <button onClick={handlePayMethod} style={{
            marginTop: 16, width: '100%', height: 48, borderRadius: 12, border: 'none',
            background: C.accent, color: C.bg, fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}>
            {t.wallet.withdraw}
          </button>
        </ModalSheet>
      )}
    </div>
  )
}

