import { useEffect, useMemo, useState } from 'react'
import Layout from '../Layout'
import { api, formatSum, formatDay } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

const EMPTY_NEW = { phone: '', name: '', password: '', role: 'user', balance_sum: '' }

export default function Users() {
  const language = useStore(s => s.language)
  const t = useT(language)

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const [creating, setCreating] = useState(false)
  const [newUser, setNewUser] = useState(EMPTY_NEW)

  const [editUser, setEditUser] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', phone: '', password: '', balance_sum: '', role: 'user' })
  const [showPassword, setShowPassword] = useState(false)

  const [contracts, setContracts] = useState([])
  const [contractsLoading, setContractsLoading] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/admin/users')
      .then(d => setUsers(d.users || []))
      .catch(e => alert(t('common.error') + ': ' + e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      [u.phone, u.name].some(v => String(v || '').toLowerCase().includes(q))
    )
  }, [users, search])

  const openEdit = (u) => {
    setEditUser(u)
    setEditForm({
      name: u.name || '',
      phone: u.phone || '',
      password: '',
      balance_sum: String(Math.floor(Number(u.balance_tiyin || 0) / 100)),
      role: u.role || 'user',
    })
    setShowPassword(false)
    setContractsLoading(true)
    setContracts([])
    api.get(`/admin/users/${u.id}/contracts`)
      .then(d => setContracts(d.contracts || []))
      .catch(() => setContracts([]))
      .finally(() => setContractsLoading(false))
  }

  const create = async () => {
    setSaving(true)
    try {
      await api.post('/admin/users', {
        phone: newUser.phone,
        name: newUser.name || null,
        password: newUser.password || null,
        role: newUser.role,
        balance_tiyin: newUser.balance_sum ? Math.round(Number(newUser.balance_sum) * 100) : 0,
      })
      setCreating(false)
      setNewUser(EMPTY_NEW)
      load()
    } catch (e) {
      alert(String(e.message).includes('user_already_exists')
        ? t('users.exists')
        : t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      await api.put(`/admin/users/${editUser.id}`, {
        name: editForm.name || undefined,
        phone: editForm.phone || undefined,
        role: editForm.role,
        password: editForm.password || undefined,
        balance_tiyin: Math.round(Number(editForm.balance_sum) * 100),
      })
      setEditUser(null)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  const remove = async (u) => {
    if (!confirm(t('users.deleteConfirm'))) return
    try {
      await api.delete(`/admin/users/${u.id}`)
      setEditUser(null)
      load()
    } catch (e) {
      alert(String(e.message).includes('has_active_contracts')
        ? t('users.hasContracts')
        : t('common.error') + ': ' + e.message)
    }
  }

  return (
    <Layout title={t('users.title')}>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('users.title')} ({filtered.length})</span>
          <button className="btn btn-primary" onClick={() => { setNewUser(EMPTY_NEW); setCreating(true) }}>
            {t('users.addBtn')}
          </button>
        </div>

        <input
          className="search-input"
          style={{ marginBottom: 14 }}
          placeholder={t('users.searchPh')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👥</div>
            {t('users.notFound')}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('common.phone')}</th>
                  <th>{t('users.balance')}</th>
                  <th>{t('users.contractsCount')}</th>
                  <th>{t('common.role')}</th>
                  <th>{t('users.registered')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td style={{ fontWeight: 600 }}>{u.name || t('common.none')}</td>
                    <td>{u.phone}</td>
                    <td>{formatSum(u.balance_tiyin, language)}</td>
                    <td>{u.contracts_count} {t('users.pcs')}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-gold' : 'badge-blue'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDay(u.created_at, language)}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(u)}>
                        {t('common.edit')}
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
            <div className="modal-title">{t('users.addTitle')}</div>

            <div className="form-group">
              <label className="form-label">{t('common.phone')}</label>
              <input
                className="form-input" placeholder={t('users.phonePh')}
                value={newUser.phone}
                onChange={e => setNewUser(f => ({ ...f, phone: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('common.name')}</label>
              <input
                className="form-input"
                value={newUser.name}
                onChange={e => setNewUser(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('users.passwordOptional')}</label>
              <input
                className="form-input" type="text"
                value={newUser.password}
                onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {t('users.passwordHint')}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('users.initialBalance')}</label>
              <input
                className="form-input" type="number"
                value={newUser.balance_sum}
                onChange={e => setNewUser(f => ({ ...f, balance_sum: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('common.role')}</label>
              <select className="form-select" value={newUser.role} onChange={e => setNewUser(f => ({ ...f, role: e.target.value }))}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving || !newUser.phone.trim()} onClick={create}>
                {saving ? t('common.adding') : t('common.add')}
              </button>
              <button className="btn btn-secondary" onClick={() => setCreating(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('users.editTitle')} — #{editUser.id}</div>

            <div className="form-group">
              <label className="form-label">{t('common.name')}</label>
              <input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('common.phone')}</label>
              <input className="form-input" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('users.newPassword')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('users.newPasswordPh')}
                  value={editForm.password}
                  onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                />
                <button className="btn btn-secondary btn-sm" onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('users.balanceSum')}</label>
              <input
                className="form-input" type="number"
                value={editForm.balance_sum}
                onChange={e => setEditForm(f => ({ ...f, balance_sum: e.target.value }))}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t('users.balanceHint')}</div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('common.role')}</label>
              <select className="form-select" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('users.contracts')}</label>
              {contractsLoading ? (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('common.loading')}</div>
              ) : contracts.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('users.noContracts')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {contracts.map(c => (
                    <div key={c.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 13, padding: '8px 10px',
                      background: 'var(--surface-2, #171b26)', borderRadius: 8,
                    }}>
                      <span>
                        #{c.id} · {t('models.' + c.model_type)}
                        {c.animal_name ? ` · ${c.animal_name}` : ''}
                        {c.payments_total > 0 ? ` · ${c.payments_paid}/${c.payments_total}` : ''}
                      </span>
                      <span style={{ color: 'var(--muted)' }}>{formatSum(c.principal_tiyin, language)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving} onClick={saveEdit}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-danger" onClick={() => remove(editUser)}>{t('common.delete')}</button>
              <button className="btn btn-secondary" onClick={() => setEditUser(null)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
