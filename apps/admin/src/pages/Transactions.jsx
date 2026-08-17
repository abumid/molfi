import { useEffect, useMemo, useState } from 'react'
import Layout from '../Layout'
import { api, formatSum, formatDate } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'
import SearchSelect from '../components/SearchSelect'

// Типы, увеличивающие баланс. Список тот же, что в admin.js на бэкенде —
// если он разъедется, форма покажет один знак, а сервер применит другой.
const INCOME_TYPES = ['deposit', 'payout', 'topup']

const ALL_TYPES = [
  'deposit', 'withdrawal', 'topup', 'payout',
  'contract_purchase', 'installment_payment', 'boarding_payment',
]

const EMPTY = { user_id: '', type: 'deposit', amount_sum: '', description: '' }

export default function Transactions() {
  const language = useStore(s => s.language)
  const t = useT(language)

  const [items, setItems] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ description: '', type: '', amount_sum: '' })

  const load = () => {
    setLoading(true)
    Promise.all([api.get('/admin/transactions'), api.get('/admin/users')])
      .then(([tx, us]) => {
        setItems(tx.transactions || [])
        setUsers(us.users || [])
      })
      .catch(e => alert(t('common.error') + ': ' + e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(x => {
      if (typeFilter !== 'all' && x.type !== typeFilter) return false
      if (!q) return true
      return [x.user_phone, x.description, x.type, String(x.id)]
        .some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [items, search, typeFilter])

  const typeLabel = (type) => {
    const key = 'transactions.' + type
    const label = t(key)
    return label === key ? type : label
  }

  const create = async () => {
    setSaving(true)
    try {
      await api.post('/admin/transactions', {
        user_id: Number(form.user_id),
        type: form.type,
        amount_tiyin: Math.round(Number(form.amount_sum) * 100),
        description: form.description || null,
      })
      setCreating(false)
      setForm(EMPTY)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      await api.put(`/admin/transactions/${editing.id}`, {
        description: editForm.description,
        type: editForm.type,
        amount_tiyin: Math.round(Number(editForm.amount_sum) * 100),
      })
      setEditing(null)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  const remove = async (x) => {
    if (!confirm(t('transactions.deleteConfirm'))) return
    try {
      await api.delete(`/admin/transactions/${x.id}`)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
  }

  const isIncome = INCOME_TYPES.includes(form.type)

  return (
    <Layout title={t('transactions.title')}>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('transactions.title')} ({filtered.length})</span>
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setCreating(true) }}>
            {t('transactions.addBtn')}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input
            className="search-input" style={{ flex: 1, minWidth: 200 }}
            placeholder={t('common.search')}
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <select className="form-select" style={{ width: 'auto' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {ALL_TYPES.map(x => <option key={x} value={x}>{typeLabel(x)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💰</div>
            {t('transactions.notFound')}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('transactions.user')}</th>
                  <th>{t('transactions.type')}</th>
                  <th>{t('transactions.amount')}</th>
                  <th>{t('transactions.contract')}</th>
                  <th>{t('transactions.description')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(x => {
                  const income = INCOME_TYPES.includes(x.type)
                  return (
                    <tr key={x.id}>
                      <td>{x.id}</td>
                      <td>{x.user_phone || '#' + x.user_id}</td>
                      <td><span className="badge badge-blue">{typeLabel(x.type)}</span></td>
                      <td style={{ color: income ? 'var(--accent)' : 'var(--red)', fontWeight: 600 }}>
                        {income ? '+' : '−'}{formatSum(Math.abs(Number(x.amount_tiyin)), language)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {x.contract_id ? '#' + x.contract_id : t('common.none')}
                      </td>
                      <td style={{ fontSize: 12 }}>{x.description || t('common.none')}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDate(x.created_at, language)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setEditing(x)
                              setEditForm({
                                description: x.description || '',
                                type: x.type,
                                amount_sum: String(Math.floor(Math.abs(Number(x.amount_tiyin)) / 100)),
                              })
                            }}
                          >
                            {t('common.edit')}
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => remove(x)}>
                            {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('transactions.addTitle')}</div>

            <div className="form-group">
              <label className="form-label">{t('transactions.user')}</label>
              <SearchSelect
                value={form.user_id}
                onChange={v => setForm(f => ({ ...f, user_id: v }))}
                placeholder={t('transactions.chooseUser')}
                searchPlaceholder={t('users.searchPh')}
                emptyText={t('users.notFound')}
                options={users.map(u => ({
                  value: u.id,
                  label: `#${u.id} ${u.name || u.phone}`,
                  hint: formatSum(u.balance_tiyin, language),
                  search: u.phone,
                }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('transactions.type')}</label>
              <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {ALL_TYPES.map(x => <option key={x} value={x}>{typeLabel(x)}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('transactions.amountSum')}</label>
              <input
                className="form-input" type="number" min="0"
                value={form.amount_sum}
                onChange={e => setForm(f => ({ ...f, amount_sum: e.target.value }))}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {t('transactions.amountHint')}
              </div>
              {form.amount_sum && (
                <div style={{ fontSize: 12, marginTop: 6, color: isIncome ? 'var(--accent)' : 'var(--red)' }}>
                  {isIncome ? '+' : '−'}{formatSum(Math.abs(Number(form.amount_sum)) * 100, language)}
                  {' — '}
                  {isIncome ? t('transactions.willAdd') : t('transactions.willSubtract')}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">{t('transactions.description')}</label>
              <input
                className="form-input"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                className="btn btn-primary" style={{ flex: 1 }}
                disabled={saving || !form.user_id || !form.amount_sum}
                onClick={create}
              >
                {saving ? t('common.adding') : t('common.add')}
              </button>
              <button className="btn btn-secondary" onClick={() => setCreating(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('transactions.editTitle')} — #{editing.id}</div>

            <div className="form-group">
              <label className="form-label">{t('transactions.type')}</label>
              <select className="form-select" value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                {ALL_TYPES.map(x => <option key={x} value={x}>{typeLabel(x)}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('transactions.amountSum')}</label>
              <input
                className="form-input" type="number"
                value={editForm.amount_sum}
                onChange={e => setEditForm(f => ({ ...f, amount_sum: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('transactions.description')}</label>
              <input
                className="form-input"
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving} onClick={saveEdit}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
