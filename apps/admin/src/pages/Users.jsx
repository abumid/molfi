import { useState, useEffect } from 'react'
import Layout from '../Layout'
import { api, formatSum, formatDate } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

export default function Users() {
  const { language } = useStore()
  const t = useT(language)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const [editUser, setEditUser] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    password: '',
    balance: 0,
    role: 'user',
  })
  const [userShares, setUserShares] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [savingUser, setSavingUser] = useState(false)

  useEffect(() => {
    api.get('/admin/users')
      .then(d => { setUsers(d.users || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = users.filter(u => {
    const matchSearch = u.phone?.includes(search) ||
      u.name?.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const openEdit = (u) => {
    setEditUser(u)
    setEditForm({
      name: u.name || '',
      phone: u.phone || '',
      password: '',
      balance: Math.floor((u.balance_tiyin || 0) / 100),
      role: u.role || 'user',
    })
    setShowPassword(false)
    setUserShares([])
    api.get(`/admin/users/${u.id}/shares`)
      .then(d => setUserShares(d.shares || []))
      .catch(() => {})
  }

  const handleSaveUser = async () => {
    setSavingUser(true)
    try {
      await api.put(`/admin/users/${editUser.id}`, {
        name: editForm.name,
        phone: editForm.phone,
        password: editForm.password || undefined,
        balance_tiyin: Math.round(Number(editForm.balance) * 100),
        role: editForm.role,
      })
      setUsers(prev => prev.map(u =>
        u.id === editUser.id ? {
          ...u,
          name: editForm.name,
          phone: editForm.phone,
          role: editForm.role,
          balance_tiyin: Math.round(Number(editForm.balance) * 100),
        } : u
      ))
      setEditUser(null)
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    } finally {
      setSavingUser(false)
    }
  }

  const handleDeleteShare = async (shareId) => {
    if (!confirm(t('users.deleteShareConfirm'))) return
    try {
      await api.delete(`/admin/shares/${shareId}`)
      setUserShares(prev => prev.filter(s => s.id !== shareId))
      setUsers(prev => prev.map(u =>
        u.id === editUser.id
          ? { ...u, shares_count: (u.shares_count || 1) - 1 }
          : u
      ))
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
  }

  return (
    <Layout title={t('users.title')}>
      <div className="card">
        <div className="card-title">
          {t('users.title')} ({filtered.length})
          <input
            className="search-input"
            placeholder={t('users.searchPh')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'user', 'admin'].map(r => (
              <button
                key={r}
                className={`btn btn-sm ${roleFilter === r ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRoleFilter(r)}
              >
                {r === 'all'
                  ? (language === 'uz' ? 'Barchasi' : 'Все')
                  : r}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('common.phone')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('common.role')}</th>
                  <th>{t('users.balance')}</th>
                  <th>{t('users.sharesCount')}</th>
                  <th>{t('users.registered')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td style={{ color: '#8892a4' }}>#{u.id}</td>
                    <td style={{ fontWeight: 500 }}>{u.phone}</td>
                    <td>{u.name || '—'}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-gold' : 'badge-blue'}`}>
                        {u.role || 'user'}
                      </span>
                    </td>
                    <td style={{ color: '#6fcf4a', fontWeight: 600 }}>
                      {formatSum(u.balance_tiyin)}
                    </td>
                    <td>{u.shares_count || 0} {t('users.pcs')}</td>
                    <td style={{ color: '#8892a4' }}>
                      {formatDate(u.created_at)}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(u)}
                      >
                        {t('common.edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty">
                <div className="empty-icon">👥</div>
                {t('users.notFound')}
              </div>
            )}
          </div>
        )}
      </div>

      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-title">
              {t('users.editTitle')}
              <button className="btn btn-secondary btn-sm"
                onClick={() => setEditUser(null)}>✕</button>
            </div>
            <div style={{ color: '#8892a4', marginBottom: 16, fontSize: 13 }}>
              {editUser.phone}
            </div>

            {editUser?.role === 'admin' && (
              <div style={{
                background: 'rgba(212,168,67,0.1)',
                border: '1px solid #d4a843',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#d4a843',
                fontSize: 12,
                marginBottom: 16
              }}>
                ⚠️ {language === 'uz'
                  ? 'Administrator akkauntini tahrirlayapsiz'
                  : 'Вы редактируете аккаунт администратора'}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">{t('common.name')}</label>
                <input
                  className="form-input"
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.phone')}</label>
                <input
                  className="form-input"
                  type="text"
                  value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
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
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowPassword(s => !s)}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">{t('users.balanceSum')}</label>
                <input
                  className="form-input"
                  type="number"
                  value={editForm.balance}
                  onChange={e => setEditForm(f => ({ ...f, balance: e.target.value }))}
                />
                <div style={{ color: '#8892a4', fontSize: 12, marginTop: 4 }}>
                  {t('users.balanceHint')}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.role')}</label>
                <select
                  className="form-input"
                  value={editForm.role}
                  onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            </div>

            <div style={{ fontWeight: 'bold', fontSize: 14, marginTop: 16, marginBottom: 8 }}>
              {t('users.assets')}
            </div>
            {userShares.length === 0 ? (
              <div style={{ color: '#8892a4', fontSize: 13 }}>
                {t('users.noAssets')}
              </div>
            ) : (
              <div>
                {userShares.map(s => (
                  <div key={s.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: '1px solid #2d3448'
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 'bold' }}>
                        🐑 {s.sheep_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#8892a4', marginTop: 2 }}>
                        {s.share_pct}% · {formatSum(s.purchase_price_tiyin)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`badge ${s.status === 'active' ? 'badge-blue' : 'badge-gold'}`}>
                        {s.status}
                      </span>
                      <button
                        onClick={() => handleDeleteShare(s.id)}
                        style={{
                          background: 'transparent', color: '#ef4444',
                          border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
                          padding: '3px 8px', fontSize: 12, cursor: 'pointer'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveUser}
                disabled={savingUser}
                style={{ flex: 1 }}
              >
                {savingUser ? t('common.saving') : t('common.save')}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setEditUser(null)}
                style={{ flex: 1 }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
