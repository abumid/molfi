import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../Layout'
import { api, formatSum } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

const MODELS = ['investment', 'ownership', 'installment']

export default function Dashboard() {
  const navigate = useNavigate()
  const language = useStore(s => s.language)
  const t = useT(language)

  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/stats')
      .then(d => setStats(d.stats))
      .catch(e => alert(t('common.error') + ': ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <Layout title={t('nav.dashboard')}><div className="loading">{t('common.loading')}</div></Layout>
  }
  if (!stats) {
    return <Layout title={t('nav.dashboard')}><div className="empty">{t('common.error')}</div></Layout>
  }

  const overdue = Number(stats.payments?.overdue) || 0

  return (
    <Layout title={t('nav.dashboard')}>
      <div className="stats-grid">
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/animals')}>
          <div className="stat-label">{t('dashboard.animals')}</div>
          <div className="stat-value green">{stats.animals?.total ?? 0}</div>
          <div className="stat-sub">
            {stats.animals?.available ?? 0} {t('animals.statusActive').toLowerCase()}
          </div>
        </div>

        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/contracts')}>
          <div className="stat-label">{t('dashboard.contracts')}</div>
          <div className="stat-value green">{stats.contracts?.total ?? 0}</div>
          <div className="stat-sub">
            {stats.contracts?.active ?? 0} {t('dashboard.activeContracts')}
          </div>
        </div>

        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/users')}>
          <div className="stat-label">{t('dashboard.users')}</div>
          <div className="stat-value">{stats.users?.total ?? 0}</div>
          <div className="stat-sub">{t('dashboard.registered')}</div>
        </div>

        {/* Просрочки — единственная плитка, которая требует действия,
            поэтому красная только когда их правда больше нуля */}
        <div
          className="stat-card"
          style={{ cursor: 'pointer', borderColor: overdue > 0 ? 'var(--red)' : undefined }}
          onClick={() => navigate('/payments')}
        >
          <div className="stat-label">{t('dashboard.overduePayments')}</div>
          <div className="stat-value" style={{ color: overdue > 0 ? 'var(--red)' : undefined }}>
            {overdue}
          </div>
          <div className="stat-sub">
            {overdue > 0 ? t('dashboard.needAttention') : '—'}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">{t('dashboard.dueThisMonth')}</div>
          <div className="stat-value gold" style={{ fontSize: 22 }}>
            {formatSum(stats.due_this_month_tiyin, language)}
          </div>
          <div className="stat-sub">
            {stats.payments?.pending ?? 0} {t('payments.statusPending').toLowerCase()}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">{t('dashboard.platform')}</div>
          <div className="stat-value" style={{ fontSize: 22 }}>Molfi</div>
          <div className="stat-sub">{t('dashboard.version')}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">{t('dashboard.byModel')}</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('contracts.model')}</th>
                <th>{t('dashboard.activeContracts')}</th>
              </tr>
            </thead>
            <tbody>
              {MODELS.map(m => (
                <tr key={m}>
                  <td><span className="badge badge-blue">{t('models.' + m)}</span></td>
                  <td style={{ fontWeight: 600 }}>{stats.by_model?.[m] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
