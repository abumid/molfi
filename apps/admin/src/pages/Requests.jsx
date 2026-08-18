import { useEffect, useMemo, useState } from 'react'
import Layout from '../Layout'
import { api, formatSum, formatDate } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

const STATUS_BADGE = {
  pending: 'badge-gold',
  approved: 'badge-green',
  rejected: 'badge-red',
}

/**
 * Заявки на пополнение и вывод.
 *
 * Пока Click и Payme не подключены, это единственный путь денег в кошелёк
 * клиента и обратно. Одобрение создаёт транзакцию и меняет баланс одной
 * операцией на сервере — здесь только решение и комментарий.
 */
export default function Requests() {
  const language = useStore(s => s.language)
  const t = useT(language)

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [deciding, setDeciding] = useState(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api.get('/admin/payment-requests')
    .then(d => setItems(d.requests || []))
    .catch(e => alert(t('common.error') + ': ' + e.message))

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      await load()
      setLoading(false)
    }
    run()
  }, [])

  const filtered = useMemo(
    () => (statusFilter === 'all' ? items : items.filter(x => x.status === statusFilter)),
    [items, statusFilter]
  )
  const pendingCount = items.filter(x => x.status === 'pending').length

  const decide = async (action) => {
    if (!deciding) return
    setBusy(true)
    try {
      await api.post(`/admin/payment-requests/${deciding.id}/${action}`, { comment: comment || null })
      setDeciding(null)
      setComment('')
      load()
    } catch (e) {
      const m = String(e.message)
      alert(m.includes('insufficient_balance')
        ? t('requests.notEnoughNow')
        : t('common.error') + ': ' + e.message)
    }
    setBusy(false)
  }

  return (
    <Layout title={t('nav.requests')}>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            {t('requests.title')}
            {pendingCount > 0 && (
              <span className="badge badge-gold" style={{ marginLeft: 8 }}>
                {pendingCount} {t('requests.waiting')}
              </span>
            )}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {['pending', 'approved', 'rejected', 'all'].map(s => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(s)}
            >
              {t('requests.' + s)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💸</div>
            {t('requests.notFound')}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('requests.user')}</th>
                  <th>{t('requests.kind')}</th>
                  <th>{t('requests.amount')}</th>
                  <th>{t('requests.userBalance')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('requests.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isTopup = r.kind === 'topup'
                  // Вывод больше остатка одобрять нельзя — сервер откажет,
                  // и лучше показать это до нажатия
                  const notEnough = !isTopup
                    && Number(r.user_balance_tiyin) < Number(r.amount_tiyin)
                  return (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--muted)' }}>#{r.id}</td>
                      <td>
                        {r.user_name || '—'}
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.user_phone}</div>
                      </td>
                      <td>
                        <span className={`badge ${isTopup ? 'badge-green' : 'badge-blue'}`}>
                          {t('requests.' + r.kind)}
                        </span>
                      </td>
                      <td style={{
                        fontWeight: 600,
                        color: isTopup ? 'var(--accent)' : 'var(--red)',
                      }}>
                        {isTopup ? '+' : '−'}{formatSum(r.amount_tiyin, language)}
                      </td>
                      <td style={{ fontSize: 12, color: notEnough ? 'var(--red)' : 'var(--muted)' }}>
                        {formatSum(r.user_balance_tiyin, language)}
                        {notEnough && <div style={{ fontSize: 11 }}>{t('requests.notEnoughNow')}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(r.created_at, language)}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[r.status]}`}>
                          {t('requests.' + r.status)}
                        </span>
                        {r.admin_comment && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                            {r.admin_comment}
                          </div>
                        )}
                      </td>
                      <td>
                        {r.status === 'pending' ? (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => { setDeciding(r); setComment('') }}
                          >
                            {t('requests.review')}
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {formatDate(r.decided_at, language)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deciding && (
        <div className="modal-overlay" onClick={() => setDeciding(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              <span>{t('requests.review')} #{deciding.id}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setDeciding(null)}>✕</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Line label={t('requests.user')}
                    value={`${deciding.user_name || ''} ${deciding.user_phone}`.trim()} />
              <Line label={t('requests.kind')} value={t('requests.' + deciding.kind)} />
              <Line label={t('requests.amount')}
                    value={formatSum(deciding.amount_tiyin, language)} strong />
              <Line label={t('requests.userBalance')}
                    value={formatSum(deciding.user_balance_tiyin, language)} />
              <Line
                label={t('requests.afterDecision')}
                value={formatSum(
                  Number(deciding.user_balance_tiyin) +
                  (deciding.kind === 'topup' ? 1 : -1) * Number(deciding.amount_tiyin),
                  language
                )}
                strong
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('requests.comment')}</label>
              <input
                className="form-input" value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={t('requests.commentHint')}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn btn-primary" style={{ flex: 1 }}
                disabled={busy} onClick={() => decide('approve')}
              >
                {busy ? t('common.saving') : t('requests.approve')}
              </button>
              <button
                className="btn btn-danger" style={{ flex: 1 }}
                disabled={busy} onClick={() => decide('reject')}
              >
                {t('requests.reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function Line({ label, value, strong }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  )
}
