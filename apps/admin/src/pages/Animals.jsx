import { useEffect, useMemo, useState } from 'react'
import Layout from '../Layout'
import { api, formatSum } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

const SPECIES = ['sheep', 'cattle', 'goat']
const STATUSES = ['active', 'reserved', 'owned', 'sold', 'slaughtered', 'dead']

// Цвет статуса: свободное животное — зелёное, проданное или павшее — приглушённое,
// в собственности — золотое, чтобы отличать «можно продать» от «уже чьё-то».
const STATUS_BADGE = {
  active: 'badge-green',
  reserved: 'badge-blue',
  owned: 'badge-gold',
  sold: 'badge-blue',
  slaughtered: 'badge-blue',
  dead: 'badge-red',
}

const EMPTY_FORM = {
  name: '', species: 'sheep', breed: '', sex: '',
  weight_kg: '', price_per_kg_sum: '', acquired_cost_sum: '',
  rfid_tag: '', birth_date: '', status: 'active',
  photo_url: '', stream_url: '',
}

const toForm = (a) => ({
  name: a.name || '',
  species: a.species || 'sheep',
  breed: a.breed || '',
  sex: a.sex || '',
  weight_kg: a.current_weight_g ? String(a.current_weight_g / 1000) : '',
  price_per_kg_sum: a.price_per_kg_tiyin ? String(Math.floor(a.price_per_kg_tiyin / 100)) : '',
  acquired_cost_sum: a.acquired_cost_tiyin ? String(Math.floor(a.acquired_cost_tiyin / 100)) : '',
  rfid_tag: a.rfid_tag || '',
  birth_date: a.birth_date ? String(a.birth_date).slice(0, 10) : '',
  status: a.status || 'active',
  photo_url: a.photo_url || '',
  stream_url: a.stream_url || '',
})

const toPayload = (f) => ({
  name: f.name.trim(),
  species: f.species,
  breed: f.breed.trim() || null,
  sex: f.sex || null,
  current_weight_g: f.weight_kg ? Math.round(Number(f.weight_kg) * 1000) : 0,
  price_per_kg_tiyin: f.price_per_kg_sum ? Math.round(Number(f.price_per_kg_sum) * 100) : null,
  acquired_cost_tiyin: f.acquired_cost_sum ? Math.round(Number(f.acquired_cost_sum) * 100) : null,
  rfid_tag: f.rfid_tag.trim() || null,
  birth_date: f.birth_date || null,
  status: f.status,
  photo_url: f.photo_url.trim() || null,
  // Пустую строку шлём намеренно: на бэкенде это «очистить ссылку».
  // Через null камеру нельзя было бы снять — COALESCE сохранил бы старую.
  stream_url: f.stream_url.trim(),
})

export default function Animals() {
  const language = useStore(s => s.language)
  const t = useT(language)

  const [animals, setAnimals] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [sellTarget, setSellTarget] = useState(null)
  const [sellForm, setSellForm] = useState({ final_weight: '', sale_price: '' })
  const [selling, setSelling] = useState(false)

  const [search, setSearch] = useState('')
  const [speciesFilter, setSpeciesFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = () => {
    setLoading(true)
    api.get('/admin/animals')
      .then(d => setAnimals(d.animals || []))
      .catch(e => alert(t('common.error') + ': ' + e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return animals.filter(a => {
      if (speciesFilter !== 'all' && a.species !== speciesFilter) return false
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (!q) return true
      return [a.name, a.breed, a.rfid_tag].some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [animals, search, speciesFilter, statusFilter])

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editing) await api.put(`/admin/animals/${editing.id}`, toPayload(form))
      else await api.post('/admin/animals', toPayload(form))
      setShowAdd(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  const remove = async (a) => {
    if (!confirm(t('animals.deleteConfirm') + ` «${a.name}»`)) return
    try {
      await api.delete(`/admin/animals/${a.id}`)
      load()
    } catch (e) {
      // Бэкенд отвечает has_active_contracts — переводим в человеческий текст
      alert(String(e.message).includes('has_active_contracts')
        ? t('animals.hasContracts')
        : t('common.error') + ': ' + e.message)
    }
  }

  const sell = async () => {
    if (!sellForm.sale_price) return
    if (!confirm(t('animals.sellConfirm'))) return
    setSelling(true)
    try {
      const res = await api.post(`/admin/animals/${sellTarget.id}/sell`, {
        final_weight_g: sellForm.final_weight ? Math.round(Number(sellForm.final_weight) * 1000) : null,
        final_sale_price_tiyin: Math.round(Number(sellForm.sale_price) * 100),
      })
      setSellTarget(null)
      setSellForm({ final_weight: '', sale_price: '' })
      load()
      if (res.payout) {
        alert(`${t('animals.payoutMade')}: ${formatSum(res.payout.amount_tiyin, language)}`)
      }
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSelling(false)
  }

  const openAdd = () => { setForm(EMPTY_FORM); setEditing(null); setShowAdd(true) }
  const openEdit = (a) => { setForm(toForm(a)); setEditing(a); setShowAdd(true) }

  const field = (key, label, type = 'text', placeholder = '') => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <Layout title={t('animals.title')}>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('animals.title')} ({filtered.length})</span>
          <button className="btn btn-primary" onClick={openAdd}>{t('animals.addBtn')}</button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <input
            className="search-input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder={t('common.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="form-select" style={{ width: 'auto' }} value={speciesFilter} onChange={e => setSpeciesFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {SPECIES.map(s => <option key={s} value={s}>{t('animals.' + s)}</option>)}
          </select>
          <select className="form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{t('animals.status' + s[0].toUpperCase() + s.slice(1))}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🐑</div>
            {t('animals.notFound')}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('animals.species')}</th>
                  <th>{t('animals.breed')}</th>
                  <th>{t('animals.weight')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('animals.rfid')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id}>
                    <td>{a.id}</td>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td>{t('animals.' + a.species)}</td>
                    <td>{a.breed || t('common.none')}</td>
                    <td>{a.current_weight_g ? (a.current_weight_g / 1000).toFixed(1) + ' kg' : t('common.none')}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[a.status] || 'badge-blue'}`}>
                        {t('animals.status' + a.status[0].toUpperCase() + a.status.slice(1))}
                      </span>
                      {a.status === 'sold' && a.final_sale_price_tiyin && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                          {t('animals.soldFor')} {formatSum(a.final_sale_price_tiyin, language)}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{a.rfid_tag || t('common.none')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(a)}>
                          {t('common.edit')}
                        </button>
                        {a.status !== 'sold' && (
                          <button className="btn btn-sm btn-primary" onClick={() => setSellTarget(a)}>
                            {t('animals.sellBtn')}
                          </button>
                        )}
                        <button className="btn btn-sm btn-danger" onClick={() => remove(a)}>
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {editing ? t('animals.editTitle') : t('animals.addTitle')}
            </div>

            {field('name', t('common.name'), 'text', t('animals.namePh'))}

            <div className="form-group">
              <label className="form-label">{t('animals.species')}</label>
              <select className="form-select" value={form.species} onChange={e => setForm(f => ({ ...f, species: e.target.value }))}>
                {SPECIES.map(s => <option key={s} value={s}>{t('animals.' + s)}</option>)}
              </select>
            </div>

            {field('breed', t('animals.breed'), 'text', t('animals.breedPh'))}

            <div className="form-group">
              <label className="form-label">{t('animals.sex')}</label>
              <select className="form-select" value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value }))}>
                <option value="">{t('common.none')}</option>
                <option value="male">{t('animals.male')}</option>
                <option value="female">{t('animals.female')}</option>
              </select>
            </div>

            {field('weight_kg', t('animals.weightKg'), 'number', '45')}
            {field('price_per_kg_sum', t('animals.pricePerKg'), 'number', '45000')}
            {field('acquired_cost_sum', t('animals.acquiredCost'), 'number', '')}
            {field('rfid_tag', t('animals.rfidTag'), 'text', 'RFID-016')}
            {field('birth_date', t('animals.birthDate'), 'date')}
            {field('photo_url', t('animals.photoUrl'), 'text', 'https://…')}

            <div className="form-group">
              <label className="form-label">{t('animals.streamUrl')}</label>
              <input
                className="form-input"
                type="text"
                placeholder="https://…/stream.m3u8"
                value={form.stream_url}
                onChange={e => setForm(f => ({ ...f, stream_url: e.target.value }))}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {t('animals.streamHint')}
              </div>
            </div>

            {editing && (
              <div className="form-group">
                <label className="form-label">{t('common.status')}</label>
                <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{t('animals.status' + s[0].toUpperCase() + s.slice(1))}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving || !form.name.trim()} onClick={submit}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditing(null) }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {sellTarget && (
        <div className="modal-overlay" onClick={() => setSellTarget(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{t('animals.sellTitle')}: {sellTarget.name}</div>

            <div className="form-group">
              <label className="form-label">{t('animals.finalWeight')}</label>
              <input
                className="form-input" type="number"
                placeholder={sellTarget.current_weight_g ? String(sellTarget.current_weight_g / 1000) : ''}
                value={sellForm.final_weight}
                onChange={e => setSellForm(f => ({ ...f, final_weight: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('animals.salePrice')}</label>
              <input
                className="form-input" type="number"
                value={sellForm.sale_price}
                onChange={e => setSellForm(f => ({ ...f, sale_price: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={selling || !sellForm.sale_price} onClick={sell}>
                {selling ? t('common.saving') : t('animals.sellBtn')}
              </button>
              <button className="btn btn-secondary" onClick={() => setSellTarget(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
