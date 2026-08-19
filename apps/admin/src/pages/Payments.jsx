import { useEffect, useMemo, useState } from 'react'
import Layout from '../Layout'
import { api, formatSum, formatDay } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

const STATUSES = ['pending', 'paid', 'overdue', 'waived']

const STATUS_BADGE = {
  pending: 'badge-blue',
  paid: 'badge-green',
  overdue: 'badge-red',
  waived: 'badge-gold',
}

const statusLabel = (t, s) => t('payments.status' + s[0].toUpperCase() + s.slice(1))

export default function Payments() {
  const language = useStore(s => s.language)
  const t = useT(language)

  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [waiving, setWaiving] = useState(null)

  const load = () => {
    setLoading(true)
    const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    api.get('/admin/payments' + qs)
      .then(d => setPayments(d.payments || []))
      .catch(e => alert(t('common.error') + ': ' + e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [statusFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return payments
    return payments.filter(p =>
      [p.user_name, p.user_phone, String(p.contract_id)]
        .some(v => String(v || '').toLowerCase().includes(q))
    )
  }, [payments, search])

  const counts = useMemo(() => {
    const c = { overdue: 0, pending: 0 }
    for (const p of payments) if (c[p.status] !== undefined) c[p.status]++
    return c
  }, [payments])

  // Paid in cash or by transfer outside the app: the wallet is left alone, or
  // the balance would show money the client does not have on the platform
  const markPaid = async (p) => {
    if (!confirm(t('payments.markPaidConfirm'))) return
    setWaiving(p.id)
    try {
      await api.post(`/admin/payments/${p.id}/mark-paid`, {})
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setWaiving(null)
  }

  const waive = async (p) => {
    // Irreversible: a waived payment cannot be put back to pending
    if (!confirm(t('payments.waiveConfirm'))) return
    setWaiving(p.id)
    try {
      await api.post(`/admin/payments/${p.id}/waive`, {})
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setWaiving(null)
  }

  return (
    <Layout title={t('payments.title')}>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('payments.title')} ({filtered.length})</span>
          {counts.overdue > 0 && (
            <span className="badge badge-red">
              {counts.overdue} {t('payments.statusOverdue').toLowerCase()}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input
            className="search-input" style={{ flex: 1, minWidth: 200 }}
            placeholder={t('common.search')}
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <select className="form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {STATUSES.map(s => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📅</div>
            {t('payments.notFound')}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('payments.contract')}</th>
                  <th>{t('payments.seq')}</th>
                  <th>{t('contracts.user')}</th>
                  <th>{t('payments.due')}</th>
                  <th>{t('payments.amount')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('payments.paidAt')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr
                    key={p.id}
                    style={p.status === 'overdue' ? { background: 'rgba(239,68,68,0.06)' } : undefined}
                  >
                    <td>#{p.contract_id}</td>
                    <td>{p.seq}</td>
                    <td>
                      <div>{p.user_name || t('common.none')}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.user_phone}</div>
                    </td>
                    <td style={{ color: p.status === 'overdue' ? 'var(--red)' : undefined }}>
                      {formatDay(p.due_date, language)}
                    </td>
                    <td>{formatSum(p.amount_tiyin, language)}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[p.status] || 'badge-blue'}`}>
                        {statusLabel(t, p.status)}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {p.paid_at ? formatDay(p.paid_at, language) : t('common.none')}
                    </td>
                    <td>
                      {['pending', 'overdue'].includes(p.status) && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm btn-primary"
                            disabled={waiving === p.id}
                            onClick={() => markPaid(p)}
                          >
                            {t('payments.markPaid')}
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            disabled={waiving === p.id}
                            onClick={() => waive(p)}
                          >
                            {t('payments.waive')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
