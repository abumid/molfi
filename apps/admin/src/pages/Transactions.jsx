import { useState, useEffect } from 'react'
import Layout from '../Layout'
import { api, formatSum, formatDate } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

const TX_TYPES = ['investment', 'deposit', 'withdrawal', 'payout', 'topup', 'share_purchase']

export default function Transactions() {
  const { language } = useStore()
  const t = useT(language)
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [searchTx, setSearchTx] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [editTx, setEditTx] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/admin/transactions')
      .then(d => { setTxs(d.transactions || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleDeleteTx = async (id, amount, type) => {
    const amountSum = Math.floor(Number(amount) / 100)
    if (!confirm(
      language === 'uz'
        ? `Tranzaksiyani o'chirishni tasdiqlaysizmi? Balans avtomatik qaytariladi.`
        : `Удалить транзакцию на ${new Intl.NumberFormat('ru-UZ').format(amountSum)} сум? Баланс будет автоматически скорректирован.`
    )) return
    try {
      await api.delete(`/admin/transactions/${id}`)
      setTxs(prev => prev.filter(tx => tx.id !== id))
    } catch (e) {
      alert((language === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + e.message)
    }
  }

  const handleEditTx = (tx) => {
    setEditTx(tx)
    setEditForm({
      description: tx.description || '',
      type: tx.type || '',
      amount_sum: String(Math.floor(Number(tx.amount_tiyin) / 100)),
    })
  }

  const handleSaveEdit = async () => {
    setSaving(true)
    try {
      const payload = {
        description: editForm.description || null,
        type: editForm.type || null,
        amount_tiyin: Math.round(Number(editForm.amount_sum) * 100),
      }
      await api.put(`/admin/transactions/${editTx.id}`, payload)
      setTxs(prev => prev.map(tx =>
        tx.id === editTx.id
          ? { ...tx, description: payload.description, type: payload.type, amount_tiyin: payload.amount_tiyin }
          : tx
      ))
      setEditTx(null)
    } catch (e) {
      alert((language === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + e.message)
    } finally {
      setSaving(false)
    }
  }

  const TYPE_INFO = {
    investment:     { icon: '📈', label: t('transactions.investment'), badge: 'badge-blue' },
    payout:         { icon: '💰', label: t('transactions.payout'), badge: 'badge-green' },
    deposit:        { icon: '⬆️', label: t('transactions.deposit'), badge: 'badge-green' },
    withdrawal:     { icon: '⬇️', label: t('transactions.withdrawal'), badge: 'badge-red' },
    topup:          { icon: '💳', label: 'Пополнение', badge: 'badge-green' },
    share_purchase: { icon: '🐑', label: 'Покупка доли', badge: 'badge-blue' },
  }

  const FILTERS = [
    ['all', t('common.all')],
    ['investment', t('transactions.investment')],
    ['deposit', t('transactions.deposit')],
    ['payout', t('transactions.payout')],
    ['withdrawal', t('transactions.withdrawal')],
  ]

  const filtered = txs.filter(tx => {
    const matchType = filter === 'all' || tx.type === filter
    const matchSearch = !searchTx ||
      tx.user_phone?.includes(searchTx) ||
      tx.description?.toLowerCase().includes(searchTx.toLowerCase())
    const txDate = new Date(tx.created_at)
    const matchFrom = !dateFrom || txDate >= new Date(dateFrom)
    const matchTo = !dateTo || txDate <= new Date(dateTo + 'T23:59:59')
    return matchType && matchSearch && matchFrom && matchTo
  })

  return (
    <Layout title={t('transactions.title')}>
      <div className="card">
        <div className="card-title">
          {t('transactions.title')} ({filtered.length})
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <input
            className="search-input"
            placeholder={language === 'uz' ? "Telefon bo'yicha..." : 'Поиск по телефону...'}
            value={searchTx}
            onChange={e => setSearchTx(e.target.value)}
            style={{ width: 200 }}
          />
          <input
            className="form-input"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ width: 160, padding: '7px 12px' }}
          />
          <input
            className="form-input"
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ width: 160, padding: '7px 12px' }}
          />
          {(searchTx || dateFrom || dateTo) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setSearchTx(''); setDateFrom(''); setDateTo('') }}
            >
              {language === 'uz' ? 'Tozalash' : 'Сбросить'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('transactions.type')}</th>
                  <th>{t('transactions.user')}</th>
                  <th>{t('transactions.description')}</th>
                  <th>{t('transactions.amount')}</th>
                  <th>{t('common.date')}</th>
                  <th>{language === 'uz' ? 'Amallar' : 'Действия'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => {
                  const info = TYPE_INFO[tx.type] || { icon: '💳', label: tx.type, badge: 'badge-blue' }
                  const isIncome = ['payout', 'deposit', 'topup'].includes(tx.type)
                  return (
                    <tr key={tx.id}>
                      <td style={{ color: '#8892a4' }}>#{tx.id}</td>
                      <td>
                        <span style={{ marginRight: 6 }}>{info.icon}</span>
                        <span className={`badge ${info.badge}`}>{info.label}</span>
                      </td>
                      <td>{tx.user_phone || `#${tx.user_id}`}</td>
                      <td style={{ color: '#8892a4' }}>{tx.description || '—'}</td>
                      <td style={{ fontWeight: 600, color: isIncome ? '#6fcf4a' : '#ef4444' }}>
                        {isIncome ? '+' : '-'}{formatSum(tx.amount_tiyin)}
                      </td>
                      <td style={{ color: '#8892a4' }}>{formatDate(tx.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleEditTx(tx)}
                            title={language === 'uz' ? 'Tahrirlash' : 'Редактировать'}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteTx(tx.id, tx.amount_tiyin, tx.type)}
                            title={language === 'uz' ? "O'chirish" : 'Удалить'}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="empty">
                <div className="empty-icon">💰</div>
                {t('transactions.notFound')}
              </div>
            )}
          </div>
        )}
      </div>

      {editTx && (
        <div className="modal-overlay" onClick={() => setEditTx(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {language === 'uz' ? 'Tranzaksiyani tahrirlash' : 'Редактировать транзакцию'} #{editTx.id}
            </div>

            <label className="form-label">
              {language === 'uz' ? 'Tur' : 'Тип'}
            </label>
            <select
              className="form-input"
              value={editForm.type}
              onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
              style={{ marginBottom: 12 }}
            >
              {TX_TYPES.map(tp => (
                <option key={tp} value={tp}>{tp}</option>
              ))}
            </select>

            <label className="form-label">
              {language === 'uz' ? "Miqdor (so'm)" : 'Сумма (сум)'}
            </label>
            <input
              className="form-input"
              type="number"
              value={editForm.amount_sum}
              onChange={e => setEditForm(f => ({ ...f, amount_sum: e.target.value }))}
              style={{ marginBottom: 12 }}
            />

            <label className="form-label">
              {language === 'uz' ? 'Tavsif' : 'Описание'}
            </label>
            <input
              className="form-input"
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              style={{ marginBottom: 20 }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveEdit}
                disabled={saving}
              >
                {saving
                  ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
                  : (language === 'uz' ? 'Saqlash' : 'Сохранить')}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setEditTx(null)}
                disabled={saving}
              >
                {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
