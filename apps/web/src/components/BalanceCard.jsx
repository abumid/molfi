import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useT } from '../i18n'
import { formatNumber, currencyLabel } from '../utils/format'
import { portfolioTotals } from '../utils/portfolio'

/**
 * Карточка баланса. Стоит и на каталоге, и в кошельке — числа обязаны
 * совпадать до тийина, поэтому компонент один, а не два похожих.
 *
 * Общий баланс крупно, под ним свободные деньги и активы раздельно:
 * инвестиции живут по сегодняшней цене, владение — по цене покупки.
 */
export default function BalanceCard({ onTopUp, onWithdraw, showActions = true }) {
  const navigate = useNavigate()
  const { language, balance, contracts } = useStore()
  const t = useT(language)
  const p = portfolioTotals(contracts, balance)

  const cur = currencyLabel(language)
  const n = (v) => formatNumber(Math.floor(v / 100), language)

  const tile = {
    background: 'rgba(0,0,0,.24)', borderRadius: 14, padding: '12px 14px', minWidth: 0,
  }
  const tileLabel = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: 'rgba(240,248,240,.65)',
  }
  const tileValue = {
    fontSize: 19, fontWeight: 700, marginTop: 5,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }
  const action = {
    flex: 1, padding: '13px 8px', borderRadius: 14, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif',
    border: 'none', background: 'transparent',
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--color-green) 0%, var(--color-surface) 100%)',
      border: '1px solid var(--color-border)', borderRadius: 20, padding: '20px 18px',
    }}>
      <div style={{ fontSize: 13, color: 'rgba(240,248,240,.65)' }}>{t.wallet.total}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 4 }}>
        <span style={{
          fontSize: 'clamp(28px, 9vw, 36px)', fontWeight: 700, color: '#fff',
          letterSpacing: -1, lineHeight: 1.05, fontFamily: 'Unbounded, sans-serif',
        }}>
          {n(p.total)}
        </span>
        <span style={{ fontSize: 15, color: 'rgba(240,248,240,.55)' }}>{cur}</span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: p.hasInvestments ? '1fr 1fr' : '1fr',
        gap: 9, marginTop: 16,
      }}>
        <div style={tile}>
          <div style={tileLabel}>
            <WalletMark />
            <span>{t.wallet.freeShort}</span>
          </div>
          <div style={{ ...tileValue, color: '#fff' }}>{n(p.free)}</div>
        </div>

        {/* Плитку инвестиций не рисуем, если их нет: прочерк на пол-экрана
            выглядит как ошибка загрузки */}
        {p.hasInvestments && (
          <div style={tile}>
            <div style={tileLabel}>
              <LockMark />
              <span>{t.wallet.inInvestments}</span>
            </div>
            <div style={{ ...tileValue, color: 'var(--color-accent)' }}>
              {n(p.investmentWorth)}
            </div>
          </div>
        )}
      </div>

      {/* Владение отдельной строкой: у него нет сегодняшней цены,
          и в одной плитке с инвестициями оно бы её подразумевало */}
      {p.hasOwnership && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, marginTop: 9, ...tile,
        }}>
          <span style={tileLabel}>
            <SheepMark />
            <span>{t.wallet.inOwnership}</span>
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
            {n(p.ownershipValue)}
          </span>
        </div>
      )}

      {p.count > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, marginTop: 12, paddingTop: 12,
          borderTop: '1px solid rgba(240,248,240,.14)',
          fontSize: 12, color: 'rgba(240,248,240,.65)', flexWrap: 'wrap',
        }}>
          <span>
            {t.wallet.assetsCount}: <b style={{ color: '#fff', fontWeight: 700 }}>{p.count}</b>
          </span>
          <span>
            {t.contracts.invested}: <b style={{ color: '#fff', fontWeight: 700 }}>{n(p.invested)}</b>
          </span>
          {p.hasInvestments && (
            <span>
              {p.pnl < 0 ? t.contracts.loss : t.contracts.profit}:{' '}
              <b style={{
                fontWeight: 700,
                color: p.pnl > 0 ? 'var(--color-success)'
                  : p.pnl < 0 ? 'var(--color-red)' : '#fff',
              }}>
                {p.pnl > 0 ? '+' : p.pnl < 0 ? '−' : ''}{n(Math.abs(p.pnl))}
              </b>
            </span>
          )}
        </div>
      )}

      {p.boardingDue > 0 && (
        <div
          onClick={() => navigate('/contracts')}
          style={{
            marginTop: 10, padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
            background: 'rgba(212,168,67,.16)', border: '1px solid var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            fontSize: 12,
          }}
        >
          <span style={{ color: 'rgba(240,248,240,.8)' }}>{t.contracts.boardingDue}</span>
          <b style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{n(p.boardingDue)}</b>
        </div>
      )}

      {showActions && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={onTopUp}
            style={{ ...action, background: 'var(--color-green-light)', color: '#0f1a0f' }}
          >
            + {t.wallet.topup}
          </button>
          <button
            onClick={onWithdraw}
            style={{ ...action, border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
          >
            {t.wallet.withdraw}
          </button>
          <button
            onClick={() => navigate('/contracts')}
            style={{ ...action, border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          >
            {t.nav.assets}
          </button>
        </div>
      )}
    </div>
  )
}

function WalletMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="6.5" width="17" height="12" rx="2.5" stroke="rgba(240,248,240,.6)" strokeWidth="1.8" />
      <path d="M15 12.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z" stroke="rgba(240,248,240,.6)" strokeWidth="1.8" />
    </svg>
  )
}

function LockMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" stroke="var(--color-accent)" strokeWidth="1.8" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="var(--color-accent)" strokeWidth="1.8" />
    </svg>
  )
}

function SheepMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="13" rx="7" ry="5.5" stroke="rgba(240,248,240,.6)" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.6" stroke="rgba(240,248,240,.6)" strokeWidth="1.8" />
      <path d="M8 18v2.5M15 18v2.5" stroke="rgba(240,248,240,.6)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
