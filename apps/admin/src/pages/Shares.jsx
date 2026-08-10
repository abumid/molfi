import { useState, useEffect } from 'react'
import Layout from '../Layout'
import { api, formatSum, formatDate } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

export default function Shares() {
  const { language } = useStore()
  const t = useT(language)
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.get('/admin/shares')
      .then(d => { setShares(d.shares || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = shares.filter(s =>
    s.sheep_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.user_phone?.includes(search)
  )

  return (
    <Layout title={t('shares.title')}>
      <div className="card">
        <div className="card-title">
          {t('shares.title')} ({filtered.length})
          <input
            className="search-input"
            placeholder={t('shares.searchPh')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('shares.sheep')}</th>
                  <th>{t('shares.investor')}</th>
                  <th>{t('shares.share')}</th>
                  <th>{t('shares.invested')}</th>
                  <th>{t('shares.expectedIncome')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('shares.buyDate')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td style={{ color: '#8892a4' }}>#{s.id}</td>
                    <td style={{ fontWeight: 600 }}>
                      🐑 {s.sheep_name || `#${s.sheep_id}`}
                    </td>
                    <td>{s.user_phone || `#${s.user_id}`}</td>
                    <td>
                      <span style={{ color: '#6fcf4a', fontWeight: 700 }}>
                        {s.share_pct}%
                      </span>
                    </td>
                    <td>{formatSum(s.purchase_price_tiyin)}</td>
                    <td>
                      {s.status === 'active' ? (
                        <span style={{ color: '#6fcf4a' }}>
                          ~{formatSum(Number(s.purchase_price_tiyin) * 1.15)}
                        </span>
                      ) : (
                        <span style={{ color: '#d4a843' }}>
                          ✓ {formatSum(s.payout_tiyin || 0)}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${s.status === 'active' ? 'badge-green' : 'badge-gold'}`}>
                        {s.status === 'active'
                          ? t('shares.activeShare')
                          : t('shares.paidShare')}
                      </span>
                    </td>
                    <td style={{ color: '#8892a4' }}>
                      {formatDate(s.purchased_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty">
                <div className="empty-icon">📈</div>
                {t('shares.notFound')}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
