import { useEffect, useMemo, useState } from 'react'
import Layout from '../Layout'
import { api, formatSum, formatDay } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

const MODELS = ['investment', 'ownership', 'installment']
const STATUSES = ['pending', 'active', 'completed', 'cancelled', 'defaulted']

const STATUS_BADGE = {
  pending: 'badge-blue',
  active: 'badge-green',
  completed: 'badge-blue',
  cancelled: 'badge-red',
  defaulted: 'badge-red',
}

const statusLabel = (t, s) => t('contracts.status' + s[0].toUpperCase() + s.slice(1))

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

export default function Contracts() {
  const language = useStore(s => s.language)
  const t = useT(language)

  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modelFilter, setModelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [newStatus, setNewStatus] = useState('active')
  const [saving, setSaving] = useState(false)

  const [creating, setCreating] = useState(false)
  const [users, setUsers] = useState([])
  const [offers, setOffers] = useState([])
  const [form, setForm] = useState({ user_id: '', product_id: '', exit_type: 'slaughter' })

  const load = () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (modelFilter !== 'all') qs.set('model_type', modelFilter)
    if (statusFilter !== 'all') qs.set('status', statusFilter)
    api.get('/admin/contracts' + (qs.toString() ? '?' + qs : ''))
      .then(d => setContracts(d.contracts || []))
      .catch(e => alert(t('common.error') + ': ' + e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [modelFilter, statusFilter])

  // Справочники для формы: клиенты и офферы, которые ещё можно продать
  const openCreate = () => {
    setForm({ user_id: '', product_id: '', exit_type: 'slaughter' })
    setCreating(true)
    Promise.all([api.get('/admin/users'), api.get('/admin/products?status=active')])
      .then(([u, p]) => {
        setUsers(u.users || [])
        setOffers((p.products || []).filter(x => x.slots_taken < x.slots_total))
      })
      .catch(e => alert(t('common.error') + ': ' + e.message))
  }

  const selectedUser = users.find(u => u.id === Number(form.user_id))
  const selectedOffer = offers.find(o => o.id === Number(form.product_id))
  // Рассрочка при оформлении ничего не списывает — платит по графику
  const charge = selectedOffer && selectedOffer.model_type !== 'installment'
    ? Number(selectedOffer.price_tiyin) : 0
  const balance = Number(selectedUser?.balance_tiyin) || 0
  const enough = balance >= charge

  const create = async () => {
    setSaving(true)
    try {
      await api.post('/admin/contracts', {
        user_id: Number(form.user_id),
        product_id: Number(form.product_id),
        exit_type: selectedOffer?.model_type === 'ownership' ? form.exit_type : undefined,
      })
      setCreating(false)
      load()
    } catch (e) {
      const msg = String(e.message)
      alert(msg.includes('animal_already_sold') ? t('contracts.animalTaken')
        : msg.includes('insufficient_balance') ? t('contracts.notEnough')
        : t('common.error') + ': ' + msg)
    }
    setSaving(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contracts
    return contracts.filter(c =>
      [c.user_name, c.user_phone, c.animal_name, c.title_en, c.title_ru]
        .some(v => String(v || '').toLowerCase().includes(q))
    )
  }, [contracts, search])

  const changeStatus = async () => {
    setSaving(true)
    try {
      await api.put(`/admin/contracts/${editing.id}`, { status: newStatus })
      setEditing(null)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  // Прогресс у каждой модели свой: у рассрочки это платежи,
  // у вклада — начисленные месяцы, у владения — статус животного.
  const progress = (c) => {
    if (c.model_type === 'installment') {
      const total = Number(c.payments_total) || 0
      const paid = Number(c.payments_paid) || 0
      const overdue = Number(c.payments_overdue) || 0
      const pct = total ? Math.round(paid / total * 100) : 0
      return (
        <div style={{ minWidth: 140 }}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: pct + '%' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {paid} {t('common.of')} {total} {t('contracts.paidOf')}
            {overdue > 0 && (
              <span style={{ color: 'var(--red)' }}> · {overdue} {t('payments.statusOverdue').toLowerCase()}</span>
            )}
          </div>
        </div>
      )
    }
    // investment и ownership: показываем животное и долг за содержание.
    // Прогресс-бара нет — у них нет фиксированного срока, показывать
    // «сколько прошло из скольких» не от чего.
    const outstanding = Math.max(0,
      (Number(c.boarding_accrued_tiyin) || 0) - (Number(c.boarding_paid_tiyin) || 0))
    return (
      <div style={{ fontSize: 12, color: 'var(--muted)', minWidth: 150 }}>
        <div>
          {c.animal_name ? `${c.animal_name} · ` : ''}
          {c.animal_status
            ? t('animals.status' + c.animal_status[0].toUpperCase() + c.animal_status.slice(1))
            : t('common.none')}
        </div>
        {outstanding > 0 && (
          <div style={{ color: 'var(--gold)', marginTop: 3 }}>
            {t('contracts.boardingOutstanding')}: {formatSum(outstanding, language)}
          </div>
        )}
      </div>
    )
  }

  return (
    <Layout title={t('contracts.title')}>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('contracts.title')} ({filtered.length})</span>
          <button className="btn btn-primary" onClick={openCreate}>{t('contracts.addBtn')}</button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input
            className="search-input" style={{ flex: 1, minWidth: 200 }}
            placeholder={t('contracts.searchPh')}
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <select className="form-select" style={{ width: 'auto' }} value={modelFilter} onChange={e => setModelFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {MODELS.map(m => <option key={m} value={m}>{t('models.' + m)}</option>)}
          </select>
          <select className="form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {STATUSES.map(s => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📄</div>
            {t('contracts.notFound')}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('contracts.user')}</th>
                  <th>{t('contracts.model')}</th>
                  <th>{t('contracts.principal')}</th>
                  <th>{t('contracts.progress')}</th>
                  <th>{t('contracts.boardingMonthly')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.user_name || t('common.none')}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.user_phone}</div>
                    </td>
                    <td><span className="badge badge-blue">{t('models.' + c.model_type)}</span></td>
                    <td>
                      <div>{formatSum(c.principal_tiyin, language)}</div>
                      {Number(c.payout_tiyin) > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--accent)' }}>
                          {t('contracts.payout')}: {formatSum(c.payout_tiyin, language)}
                        </div>
                      )}
                    </td>
                    <td>{progress(c)}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {c.boarding_fee_monthly_tiyin
                        ? formatSum(c.boarding_fee_monthly_tiyin, language)
                        : c.matures_at ? formatDay(c.matures_at, language) : t('common.none')}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[c.status] || 'badge-blue'}`}>
                        {statusLabel(t, c.status)}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => { setEditing(c); setNewStatus(c.status) }}
                      >
                        {t('contracts.changeStatus')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('contracts.addTitle')}</div>

            <div className="form-group">
              <label className="form-label">{t('contracts.user')}</label>
              <select className="form-select" value={form.user_id}
                onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">{t('contracts.chooseClient')}</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    #{u.id} {u.name || ''} {u.phone} · {formatSum(u.balance_tiyin, language)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('products.title')}</label>
              <select className="form-select" value={form.product_id}
                onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                <option value="">{t('contracts.chooseOffer')}</option>
                {offers.map(o => (
                  <option key={o.id} value={o.id}>
                    #{o.id} {t('models.' + o.model_type)}
                    {o.animal_name ? ` · ${o.animal_name}` : ''} · {formatSum(o.price_tiyin, language)}
                  </option>
                ))}
              </select>
              {offers.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>
                  {t('contracts.noOffers')}
                </div>
              )}
            </div>

            {selectedOffer?.model_type === 'ownership' && (
              <div className="form-group">
                <label className="form-label">{t('contracts.exitLabel')}</label>
                <select className="form-select" value={form.exit_type}
                  onChange={e => setForm(f => ({ ...f, exit_type: e.target.value }))}>
                  <option value="slaughter">{t('contracts.exitMeat')}</option>
                  <option value="sale">{t('contracts.exitSale')}</option>
                </select>
              </div>
            )}

            {/* Расчёт до подтверждения: админ должен видеть, что спишется,
                а не узнавать это из ошибки после нажатия */}
            {selectedOffer && (
              <div style={{
                background: 'var(--surface-2, #171b26)', borderRadius: 10,
                padding: 12, fontSize: 13, marginBottom: 12,
              }}>
                <Row label={t('contracts.willCharge')} value={formatSum(charge, language)} />
                {selectedUser && (
                  <Row
                    label={t('contracts.clientBalance')}
                    value={formatSum(balance, language)}
                    color={enough ? undefined : 'var(--red)'}
                  />
                )}
                {selectedOffer.boarding_fee_monthly_tiyin && (
                  <Row
                    label={t('contracts.boardingMonthly')}
                    value={formatSum(selectedOffer.boarding_fee_monthly_tiyin, language)}
                  />
                )}
                <Row
                  label={t('contracts.exitLabel')}
                  value={selectedOffer.model_type === 'investment'
                    ? t('contracts.exitSale')
                    : selectedOffer.model_type === 'ownership'
                      ? (form.exit_type === 'sale' ? t('contracts.exitSale') : t('contracts.exitMeat'))
                      : t('products.meatWeight')}
                />
                {!enough && selectedUser && (
                  <div style={{ color: 'var(--red)', marginTop: 6 }}>{t('contracts.notEnough')}</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary" style={{ flex: 1 }}
                disabled={saving || !form.user_id || !form.product_id || !enough}
                onClick={create}
              >
                {saving ? t('common.saving') : t('common.confirm')}
              </button>
              <button className="btn btn-secondary" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {t('contracts.changeStatus')} — #{editing.id}
            </div>

            <div className="form-group">
              <label className="form-label">{t('common.status')}</label>
              <select className="form-select" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving} onClick={changeStatus}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
