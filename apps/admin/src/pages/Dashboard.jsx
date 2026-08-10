import { useState, useEffect } from 'react'
import Layout from '../Layout'
import { api, formatSum } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

export default function Dashboard() {
  const { language } = useStore()
  const t = useT(language)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/admin/sheep'),
      api.get('/admin/users'),
      api.get('/admin/shares'),
    ]).then(([sheepData, usersData, sharesData]) => {
      const sheep = sheepData?.sheep || []
      const users = usersData?.users || []
      const shares = sharesData?.shares || []
      setStats({
        totalSheep: sheep.length,
        activeSheep: sheep.filter(s => s.status === 'active').length,
        totalUsers: users.length,
        totalInvested: shares.reduce(
          (s, x) => s + (Number(x.purchase_price_tiyin) || 0), 0
        ),
        totalShares: shares.length,
        activeShares: shares.filter(s => s.status === 'active').length,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <Layout title={t('nav.dashboard')}>
      {loading ? (
        <div className="loading">{t('common.loading')}</div>
      ) : stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">{t('dashboard.totalSheep')}</div>
            <div className="stat-value green">{stats.totalSheep}</div>
            <div className="stat-sub">
              {stats.activeSheep} {t('dashboard.activeSheep')}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('dashboard.totalUsers')}</div>
            <div className="stat-value blue">{stats.totalUsers}</div>
            <div className="stat-sub">{t('dashboard.registered')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('dashboard.totalInvested')}</div>
            <div className="stat-value gold">
              {formatSum(stats.totalInvested)}
            </div>
            <div className="stat-sub">{t('dashboard.inShares')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('dashboard.totalShares')}</div>
            <div className="stat-value green">{stats.totalShares}</div>
            <div className="stat-sub">
              {stats.activeShares} {t('dashboard.active')}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
