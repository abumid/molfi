import { useState, useEffect } from 'react'
import Layout from '../Layout'
import { api, formatSum } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

const EMPTY_FORM = {
  name: '', breed: '', weight: '',
  rfid: '', total_shares: 100, birth_date: '',
  price_per_kg: '45000'
}

export default function Sheep() {
  const { language } = useStore()
  const t = useT(language)
  const [sheep, setSheep] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [sellModal, setSellModal] = useState(null)
  const [sellForm, setSellForm] = useState({ final_weight: '', sale_price: '' })
  const [selling, setSelling] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [breedFilter, setBreedFilter] = useState('')
  const [searchSheep, setSearchSheep] = useState('')

  const load = () => {
    api.get('/admin/animals')
      .then(d => { setSheep(d.animals || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    setSaving(true)
    try {
      const weightG = Math.round(Number(form.weight) * 1000)
      const pricePerKgTiyin = Math.round(Number(form.price_per_kg) * 100)
      // Цена барана = вес × цена за кг
      const priceTiyin = Math.round(weightG / 1000 * pricePerKgTiyin)

      await api.post('/admin/animals', {
        name: form.name,
        breed: form.breed,
        current_weight_g: weightG,
        price_tiyin: priceTiyin,
        price_per_kg_tiyin: pricePerKgTiyin,
        rfid_tag: form.rfid,
        total_shares: Number(form.total_shares) || 100,
        birth_date: form.birth_date || null,
        status: 'active'
      })
      setShowAdd(false)
      setForm(EMPTY_FORM)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  const handleDeleteSheep = async (id, name) => {
    if (!confirm(
      language === 'uz'
        ? `"${name}" ni o'chirishni tasdiqlaysizmi?`
        : `Удалить "${name}"? Это действие нельзя отменить.`
    )) return
    try {
      await api.delete(`/admin/animals/${id}`)
      setSheep(prev => prev.filter(s => s.id !== id))
    } catch (e) {
      alert(
        language === 'uz'
          ? 'Xatolik: ' + e.message
          : 'Ошибка: ' + e.message
      )
    }
  }

  const handleUnsell = async (s) => {
    if (!confirm(
      language === 'uz'
        ? `"${s.name}" sotuvini bekor qilmoqchimisiz?`
        : `Отменить продажу "${s.name}"? Выплаты будут списаны обратно.`
    )) return
    try {
      const result = await api.post(
        `/admin/animals/${s.id}/unsell`, {}
      )
      setSheep(prev => prev.map(x =>
        x.id === s.id ? { ...x, status: 'active' } : x
      ))
      alert(
        language === 'uz'
          ? `✅ Qaytarildi! ${result.reversed_count} ta to'lov bekor qilindi`
          : `✅ Откат выполнен! Отменено выплат: ${result.reversed_count}`
      )
    } catch (e) {
      const err = JSON.parse(e.message || '{}')
      if (err.error === 'insufficient_balance') {
        alert(
          language === 'uz'
            ? 'Xatolik: Ba\'zi investorlarda mablag\' yetarli emas'
            : 'Ошибка: У некоторых инвесторов недостаточно баланса для возврата'
        )
      } else {
        alert((language === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + e.message)
      }
    }
  }

  const handleEdit = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const weightG = Math.round(Number(selected.weight_kg) * 1000)
      const pricePerKgTiyin = Math.round(Number(selected.price_per_kg_sum) * 100)
      const priceTiyin = Math.round(weightG / 1000 * pricePerKgTiyin)

      await api.put(`/admin/animals/${selected.id}`, {
        name: selected.name,
        breed: selected.breed,
        current_weight_g: weightG,
        price_tiyin: priceTiyin,
        price_per_kg_tiyin: pricePerKgTiyin,
        rfid_tag: selected.rfid_tag,
        status: selected.status
      })
      setSelected(null)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  const handleSell = async () => {
    if (!sellForm.final_weight) return
    if (!confirm(
      language === 'uz'
        ? 'Rostdan ham sotmoqchimisiz?'
        : 'Подтвердить продажу барана?'
    )) return
    setSelling(true)
    try {
      const result = await api.post(
        `/admin/animals/${sellModal.id}/sell`,
        {
          final_weight_g: Math.round(
            Number(sellForm.final_weight) * 1000
          ),
          final_sale_price_tiyin: sellForm.sale_price
            ? Math.round(Number(sellForm.sale_price) * 100)
            : null
        }
      )
      setSheep(prev => prev.map(s =>
        s.id === sellModal.id
          ? { ...s, status: 'sold' }
          : s
      ))
      setSellModal(null)
      setSellForm({ final_weight: '', sale_price: '' })
      alert(
        language === 'uz'
          ? `✅ Sotildi! Jami to'lov: ${
              new Intl.NumberFormat('ru-UZ').format(
                Math.floor((result.total_paid_tiyin||0)/100)
              )
            } so'm`
          : `✅ Продано! Всего выплачено: ${
              new Intl.NumberFormat('ru-UZ').format(
                Math.floor((result.total_paid_tiyin||0)/100)
              )
            } сум`
      )
    } catch (e) {
      alert(
        (language === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + e.message
      )
    } finally {
      setSelling(false)
    }
  }

  const filteredSheep = sheep.filter(s => {
    const matchSearch = s.name?.toLowerCase()
      .includes(searchSheep.toLowerCase())
    const matchStatus = statusFilter === 'all' ||
      s.status === statusFilter
    const matchBreed = !breedFilter || s.breed === breedFilter
    return matchSearch && matchStatus && matchBreed
  })

  const FORM_FIELDS = (form, setForm) => [
    ['name', t('common.name'), 'text', t('sheep.namePh')],
    ['breed', t('sheep.breed'), 'text', t('sheep.breedPh')],
    ['weight', t('sheep.weightKg'), 'number', '45'],
    ['price_per_kg', 'Цена мяса за кг (сум)', 'number', '45000'],
    ['rfid', t('sheep.rfidTag'), 'text', 'RFID-016'],
    ['birth_date', t('sheep.birthDate'), 'date', ''],
    ['total_shares', t('sheep.totalShares'), 'number', '100'],
  ].map(([key, label, type, ph]) => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        placeholder={ph}
        value={form[key] || ''}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
      />
      {key === 'price_per_kg' && form.weight && form.price_per_kg && (
        <div style={{ fontSize: 12, color: '#6fcf4a', marginTop: 4 }}>
          {language === 'uz' ? 'Qo\'y narxi' : 'Цена барана'}:
          {' '}
          {formatSum(
            Math.round(Number(form.weight) * Number(form.price_per_kg) * 100)
          )}
        </div>
      )}
    </div>
  ))

  return (
    <Layout title={t('sheep.title')}>
      <div className="card">
        <div className="card-title">
          {t('sheep.title')} ({filteredSheep.length})
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            {t('sheep.addBtn')}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            className="search-input"
            placeholder={language === 'uz' ? 'Qidirish...' : 'Поиск по имени...'}
            value={searchSheep}
            onChange={e => setSearchSheep(e.target.value)}
            style={{ width: 200 }}
          />

          {['all', 'active', 'sold'].map(s => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all'
                ? (language === 'uz' ? 'Barchasi' : 'Все')
                : s === 'active'
                  ? (language === 'uz' ? 'Faol' : 'Активные')
                  : (language === 'uz' ? 'Sotilgan' : 'Проданные')}
            </button>
          ))}

          <select
            className="form-select"
            value={breedFilter}
            onChange={e => setBreedFilter(e.target.value)}
            style={{ width: 180, padding: '6px 12px' }}
          >
            <option value="">
              {language === 'uz' ? 'Barcha zotlar' : 'Все породы'}
            </option>
            {[...new Set(sheep.map(s => s.breed).filter(Boolean))].map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('sheep.breed')}</th>
                  <th>{t('sheep.weight')}</th>
                  <th>{language === 'uz' ? 'Narxi' : 'Цена'}</th>
                  <th>{language === 'uz' ? 'Narxi/kg' : 'Цена/кг'}</th>
                  <th>{t('sheep.shares')}</th>
                  <th>{t('sheep.rfid')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSheep.map(s => (
                  <tr key={s.id}>
                    <td style={{ color: '#8892a4' }}>#{s.id}</td>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>{s.breed}</td>
                    <td>{(s.current_weight_g/1000).toFixed(1)} кг</td>
                    <td style={{ color: '#d4a843' }}>
                      {formatSum(s.price_tiyin)}
                    </td>
                    <td style={{ color: '#8892a4' }}>
                      {formatSum(s.price_per_kg_tiyin)}/кг
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: (s.sold_shares/s.total_shares*100) + '%' }}
                          />
                        </div>
                        <span style={{ color: '#8892a4', fontSize: 12 }}>
                          {s.sold_shares}/{s.total_shares}%
                        </span>
                      </div>
                    </td>
                    <td style={{ color: '#8892a4', fontSize: 12 }}>
                      {s.rfid_tag || '—'}
                    </td>
                    <td>
                      <span className={`badge ${s.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                        {s.status === 'active' ? t('common.active') : t('common.sold')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelected({
                            ...s,
                            weight_kg: (s.current_weight_g/1000).toFixed(1),
                            price_sum: Math.floor(s.price_tiyin/100),
                            price_per_kg_sum: Math.floor((s.price_per_kg_tiyin||4500000)/100)
                          })}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteSheep(s.id, s.name)}
                        >
                          {t('common.delete')}
                        </button>
                        {s.status === 'active' && (
                          <button
                            className="btn btn-sm"
                            style={{
                              background: 'rgba(212,168,67,0.15)',
                              color: '#d4a843',
                              border: '1px solid rgba(212,168,67,0.3)',
                              marginLeft: 4
                            }}
                            onClick={() => setSellModal(s)}
                          >
                            💰 {language === 'uz' ? 'Sotish' : 'Продать'}
                          </button>
                        )}
                        {s.status === 'sold' && (
                          <button
                            className="btn btn-sm"
                            style={{
                              background: 'rgba(239,68,68,0.1)',
                              color: '#ef4444',
                              border: '1px solid rgba(239,68,68,0.3)',
                              marginLeft: 4
                            }}
                            onClick={() => handleUnsell(s)}
                          >
                            ↩ {language === 'uz' ? 'Qaytarish' : 'Откатить'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredSheep.length === 0 && (
              <div className="empty">
                <div className="empty-icon">🐑</div>
                {t('sheep.notFound')}
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {t('sheep.addTitle')}
              <button className="btn btn-secondary btn-sm"
                onClick={() => setShowAdd(false)}>✕</button>
            </div>
            {FORM_FIELDS(form, setForm)}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleAdd}
                disabled={saving} style={{ flex: 1 }}>
                {saving ? t('common.adding') : t('common.add')}
              </button>
              <button className="btn btn-secondary"
                onClick={() => setShowAdd(false)} style={{ flex: 1 }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {t('sheep.editTitle')}
              <button className="btn btn-secondary btn-sm"
                onClick={() => setSelected(null)}>✕</button>
            </div>
            {[
              ['name', t('common.name')],
              ['breed', t('sheep.breed')],
              ['weight_kg', t('sheep.weightKg')],
              ['price_per_kg_sum', 'Цена мяса за кг (сум)'],
              ['rfid_tag', t('sheep.rfidTag')],
            ].map(([key, label]) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input
                  className="form-input"
                  value={selected[key] || ''}
                  onChange={e => setSelected(p => ({ ...p, [key]: e.target.value }))}
                />
                {key === 'price_per_kg_sum' && (
                  <div style={{ fontSize: 12, color: '#6fcf4a', marginTop: 4 }}>
                    {language === 'uz' ? 'Hisoblangan narx' : 'Расчётная цена'}:
                    {' '}
                    {formatSum(
                      Math.round(
                        Number(selected?.weight_kg || 0) *
                        Number(selected?.price_per_kg_sum || 0) * 100
                      )
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">{t('common.status')}</label>
              <select
                className="form-select"
                value={selected.status}
                onChange={e => setSelected(p => ({ ...p, status: e.target.value }))}
              >
                <option value="active">{t('common.active')}</option>
                <option value="sold">{t('common.sold')}</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleEdit}
                disabled={saving} style={{ flex: 1 }}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-secondary"
                onClick={() => setSelected(null)} style={{ flex: 1 }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sellModal && (
        <div className="modal-overlay" onClick={() => setSellModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              💰 {language === 'uz' ? 'Qo\'yni sotish' : 'Продать барана'}
              <button className="btn btn-secondary btn-sm"
                onClick={() => setSellModal(null)}>✕</button>
            </div>

            <div style={{
              background: 'var(--surface-2)',
              borderRadius: 8, padding: '12px 14px', marginBottom: 16
            }}>
              <div style={{ fontWeight: 600 }}>🐑 {sellModal.name}</div>
              <div style={{ color: '#8892a4', fontSize: 13, marginTop: 4 }}>
                {language === 'uz' ? 'Joriy og\'irlik' : 'Текущий вес'}:
                {' '}{(sellModal.current_weight_g/1000).toFixed(1)} кг
              </div>
              <div style={{ color: '#8892a4', fontSize: 13, marginTop: 2 }}>
                {language === 'uz' ? 'Investorlar' : 'Инвесторов'}:
                {' '}{sellModal.sold_shares}%
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                {language === 'uz' ? 'Yakuniy og\'irlik (kg)' : 'Финальный вес (кг)'}
              </label>
              <input
                className="form-input"
                type="number"
                placeholder={
                  (sellModal.current_weight_g/1000).toFixed(1)
                }
                value={sellForm.final_weight}
                onChange={e => setSellForm(p => ({
                  ...p, final_weight: e.target.value
                }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                {language === 'uz'
                  ? 'Sotuv narxi (so\'m, ixtiyoriy)'
                  : 'Цена продажи (сум, необязательно)'}
              </label>
              <input
                className="form-input"
                type="number"
                placeholder={
                  language === 'uz'
                    ? 'Bo\'sh qoldiring — avtomatik hisoblanadi'
                    : 'Оставьте пустым — рассчитается автоматически'
                }
                value={sellForm.sale_price}
                onChange={e => setSellForm(p => ({
                  ...p, sale_price: e.target.value
                }))}
              />
              {sellForm.final_weight && (
                <div style={{ fontSize: 12, color: '#6fcf4a', marginTop: 6 }}>
                  {language === 'uz' ? 'Taxminiy narx' : 'Расчётная цена'}:
                  {' '}
                  {formatSum(
                    Math.round(
                      Number(sellForm.final_weight) *
                      (sellModal.price_per_kg_tiyin || 4500000)
                    )
                  )}
                </div>
              )}
            </div>

            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px',
              color: '#ef4444', fontSize: 12, marginBottom: 16
            }}>
              ⚠️ {language === 'uz'
                ? 'Bu amalni bekor qilib bo\'lmaydi. Barcha investorlarga avtomatik to\'lov amalga oshiriladi.'
                : 'Это действие нельзя отменить. Всем инвесторам будет автоматически начислена выплата.'
              }
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-danger"
                onClick={handleSell}
                disabled={!sellForm.final_weight || selling}
                style={{ flex: 1 }}
              >
                {selling
                  ? (language === 'uz' ? 'Sotilmoqda...' : 'Продажа...')
                  : (language === 'uz' ? 'Sotishni tasdiqlash' : 'Подтвердить продажу')
                }
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setSellModal(null)}
                style={{ flex: 1 }}
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
