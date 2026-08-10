import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import MolfiLogo from '../components/Logo'

const formatSum = (tiyin) => {
  if (!tiyin && tiyin !== 0) return '0 сум'
  return new Intl.NumberFormat('ru-UZ').format(Math.floor((tiyin || 0) / 100)) + ' сум'
}

const ageMonths = (birthDate) => {
  if (!birthDate) return '?'
  return Math.floor((Date.now() - new Date(birthDate)) / (1000 * 60 * 60 * 24 * 30))
}

const tt = (lang, ru, uz) => (lang === 'uz' ? uz : ru)

function MiniProgress({ pct, color }) {
  return (
    <div style={{ background: 'var(--color-surface-2)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  )
}

function StatusBadge({ status, lang }) {
  const active = status === 'active'
  return (
    <span style={{
      padding: '4px 10px', borderRadius: 999, fontSize: 11,
      background: active ? 'rgba(58,154,58,0.15)' : 'rgba(224,85,85,0.15)',
      color: active ? 'var(--color-green-light)' : 'var(--color-red)',
      border: `1px solid ${active ? 'rgba(58,154,58,0.3)' : 'rgba(224,85,85,0.3)'}`,
    }}>
      {active ? tt(lang, 'Активен', 'Faol') : tt(lang, 'Продан', 'Sotildi')}
    </span>
  )
}

function AssetCard({ s, language, navigate }) {
  return (
    <div onClick={() => navigate(`/sheep/${s.sheep_id}`)} style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16,
      padding: 16, marginBottom: 12, cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🐑</span>
          <strong style={{ fontSize: 15 }}>{s.sheep_name || s.name}</strong>
        </div>
        {/* sheep_status = статус самого барана (активен/продан), s.status у активных
            долей всегда 'active', т.к. /shares/user/:id уже фильтрует только активные доли */}
        <StatusBadge status={s.sheep_status || 'active'} lang={language} />
      </div>
      <div style={{ marginTop: 4, color: 'var(--color-text-muted)', fontSize: 13 }}>
        {s.breed} · {(s.current_weight_g / 1000).toFixed(1)} {tt(language, 'кг', 'kg')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
        <span style={{ color: 'var(--color-green-light)' }}>{tt(language, 'Моя доля: ', 'Mening ulushim: ')}{s.share_pct}%</span>
        <span style={{ color: 'var(--color-text-muted)' }}>{tt(language, 'Вложено: ', 'Kiritildi: ')}{formatSum(s.purchase_price_tiyin)}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <MiniProgress pct={s.share_pct} color="var(--color-green-light)" />
      </div>
      <div style={{ marginTop: 8, color: 'var(--color-accent)', fontSize: 12 }}>
        {tt(language, 'Ожид. доход: ', 'Kutilgan daromad: ')}{formatSum((s.purchase_price_tiyin || 0) * 0.15)}
      </div>
    </div>
  )
}

function CatalogCard({ s, language, navigate }) {
  const soldPct = Math.round((s.sold_shares / s.total_shares) * 100) || 0
  return (
    <div onClick={() => navigate(`/sheep/${s.id}`)} style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16,
      marginBottom: 12, overflow: 'hidden', cursor: 'pointer',
    }}>
      <div style={{
        background: 'var(--color-surface-2)', height: 130, display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 72,
      }}>
        🐑
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</strong>
          <StatusBadge status={s.status} lang={language} />
        </div>
        <div style={{ marginTop: 4, color: 'var(--color-text-muted)', fontSize: 13 }}>
          {s.breed} · {ageMonths(s.birth_date)} {tt(language, 'мес', 'oy')}
        </div>
        <div style={{ marginTop: 4, color: 'var(--color-text-muted)', fontSize: 13 }}>
          {tt(language, 'Вес: ', "Vazn: ")}{(s.current_weight_g / 1000).toFixed(1)} {tt(language, 'кг', 'kg')}
        </div>

        <div style={{ marginTop: 12, marginBottom: 12, borderTop: '1px solid var(--color-border)' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{tt(language, 'Мин. доля: 10%', "Min. ulush: 10%")}</div>
            <div style={{ fontSize: 14, color: 'var(--color-accent)', fontWeight: 600, marginTop: 2 }}>
              {formatSum(s.price_tiyin * 0.1)}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {soldPct}% {tt(language, 'продано', 'sotildi')}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <MiniProgress pct={(s.sold_shares / s.total_shares) * 100} color="var(--color-accent)" />
        </div>

        <button onClick={e => { e.stopPropagation(); navigate(`/sheep/${s.id}`) }} style={{
          marginTop: 12, width: '100%', background: 'var(--color-green-light)', color: 'var(--color-bg)',
          fontWeight: 700, height: 48, borderRadius: 12, border: 'none',
          fontSize: 15, cursor: 'pointer',
        }}>
          {tt(language, 'Инвестировать →', 'Investitsiya →')}
        </button>
      </div>
    </div>
  )
}

export default function Catalog() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    sheep, myShares, balance, transactions,
    fetchSheep, fetchMyShares, fetchBalance, fetchTransactions,
    language, setLanguage, user, isAuthenticated,
  } = useStore()

  const initialTab = searchParams.get('tab') === 'available' ? 'catalog' : 'assets'
  const [tab, setTab] = useState(initialTab)

  useEffect(() => {
    fetchSheep()
    fetchBalance()
  }, [])
  useEffect(() => {
    if (isAuthenticated && user) { fetchMyShares(); fetchTransactions() }
  }, [isAuthenticated, user])

  useEffect(() => {
    if (searchParams.get('tab') === 'available') setTab('catalog')
  }, [searchParams])

  const t = (ru, uz) => tt(language, ru, uz)

  const totalInvested = myShares.reduce((sum, s) => sum + (Number(s.purchase_price_tiyin) || 0), 0)
  const expectedPayout = Math.round(totalInvested * 0.15)
  const activeAnimals = myShares.filter(s => s.status === 'active').length

  const TABS = [
    { id: 'assets', labelRu: 'Активы', labelUz: 'Aktivlar' },
    { id: 'catalog', labelRu: 'Каталог', labelUz: 'Katalog' },
    { id: 'history', labelRu: 'История', labelUz: 'Tarix' },
  ]

  return (
    <div style={{ padding: '20px 16px 90px', fontFamily: 'Inter, sans-serif', color: 'var(--color-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <MolfiLogo size={30} />
        <button
          onClick={() => setLanguage(language === 'ru' ? 'uz' : 'ru')}
          style={{
            padding: '8px 16px',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            color: 'var(--color-accent)',
            fontWeight: 700, fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          {language === 'ru' ? 'UZ' : 'RU'}
        </button>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, var(--color-green) 0%, var(--color-surface) 100%)',
        border: '1px solid var(--color-border)', borderRadius: 20, padding: 20, marginBottom: 16,
      }}>
        {/* Свободный баланс */}
        <div style={{
          fontSize: 13,
          color: 'rgba(240,248,240,0.7)',
          marginBottom: 4
        }}>
          {language === 'uz' ? 'Erkin balans' : 'Свободный баланс'}
        </div>
        <div style={{
          fontSize: 32, fontWeight: 800,
          fontFamily: 'Unbounded, sans-serif',
          color: '#fff', marginBottom: 8,
          letterSpacing: -1
        }}>
          {new Intl.NumberFormat('ru-UZ').format(
            Math.floor((balance || 0) / 100)
          )}
          <span style={{
            fontSize: 16, fontWeight: 400,
            color: 'rgba(255,255,255,0.6)',
            marginLeft: 8
          }}>UZS</span>
        </div>

        {/* Заморожено в долях */}
        {totalInvested > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 16,
            background: 'rgba(0,0,0,0.15)',
            borderRadius: 10,
            padding: '8px 12px',
            width: 'fit-content'
          }}>
            <span style={{ fontSize: 14 }}>🔒</span>
            <span style={{
              fontSize: 12,
              color: 'rgba(240,248,240,0.6)'
            }}>
              {language === 'uz'
                ? 'Ulushda muzlatilgan'
                : 'Заморожено в долях'}:
            </span>
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--color-accent-light)'
            }}>
              {new Intl.NumberFormat('ru-UZ').format(
                Math.floor(totalInvested / 100)
              )} сум
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {[
            [t('Активов', 'Aktivlar'), activeAnimals + ' ' + t('шт', 'ta')],
            [t('Вложено', 'Investitsiya'), new Intl.NumberFormat('ru-UZ').format(Math.floor(totalInvested / 100)) + ' сум'],
            [t('Ожид. доход', 'Kutilgan'), '~' + new Intl.NumberFormat('ru-UZ').format(Math.floor(expectedPayout / 100)) + ' сум'],
          ].map(([label, value]) => (
            <div key={label} style={{ flex: 1, background: 'rgba(0,0,0,0.15)', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[
            [t('+ Пополнить', "+ To'ldirish"), 'var(--color-green)', 'none', 'var(--color-text)', () => navigate('/wallet')],
            [t('↗ Вывести', '↗ Yechish'), 'transparent', '1px solid var(--color-accent)', 'var(--color-accent)', () => navigate('/wallet')],
            [t('🐑 Купить', '🐑 Sotib ol'), 'transparent', '1px solid var(--color-border)', 'var(--color-text-muted)', () => setTab('catalog')],
          ].map(([label, bg, border, color, onClick]) => (
            <button
              key={label}
              onClick={onClick}
              style={{
                flex: 1, padding: '10px 4px',
                background: bg,
                border,
                borderRadius: 12,
                color, fontWeight: 600,
                fontSize: 12, cursor: 'pointer',
                fontFamily: 'Inter, sans-serif'
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: 'var(--color-surface)', borderRadius: 12, padding: 4, border: '1px solid var(--color-border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13,
            background: tab === t.id ? 'var(--color-green-light)' : 'transparent',
            color: tab === t.id ? 'var(--color-bg)' : 'var(--color-text-muted)',
            fontWeight: tab === t.id ? 700 : 500,
          }}>
            {tt(language, t.labelRu, t.labelUz)}
          </button>
        ))}
      </div>

      {tab === 'assets' && (
        <div>
          {myShares.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 40 }}>
              {tt(language, 'У вас пока нет активов', "Sizda hali aktivlar yo'q")}
            </p>
          )}
          {myShares.map(s => (
            <AssetCard key={s.id} s={s} language={language} navigate={navigate} />
          ))}
        </div>
      )}

      {tab === 'catalog' && (
        <div>
          {sheep.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 40 }}>
              {tt(language, 'Загрузка...', 'Yuklanmoqda...')}
            </p>
          )}
          {sheep.map(s => (
            <CatalogCard key={s.id} s={s} language={language} navigate={navigate} />
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div>
          {transactions.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 40 }}>
              {tt(language, 'История пуста', "Tarix bo'sh")}
            </p>
          )}
          {transactions.map(tx => (
            <div key={tx.id} style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14,
              padding: 14, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{tx.description || tx.type}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {new Date(tx.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: tx.amount_tiyin >= 0 ? 'var(--color-success)' : 'var(--color-red)',
              }}>
                {tx.amount_tiyin >= 0 ? '+' : ''}{formatSum(tx.amount_tiyin)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
