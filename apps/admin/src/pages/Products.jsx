import { useEffect, useMemo, useState } from 'react'
import Layout from '../Layout'
import { api, formatSum } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'
import SearchSelect from '../components/SearchSelect'

const MODELS = ['investment', 'ownership', 'installment']
// Модели, продающие конкретное животное: им нужны животное, цена и абонплата
const ANIMAL_MODELS = ['investment', 'ownership']

const STATUS_BADGE = {
  draft: 'badge-blue',
  active: 'badge-green',
  sold_out: 'badge-gold',
  closed: 'badge-red',
}

const statusKey = (s) => 'products.status' + s.split('_').map((p, i) =>
  i === 0 ? p[0].toUpperCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1)
).join('')

const EMPTY_FORM = {
  model_type: 'investment',
  animal_id: '',
  title_en: '', title_ru: '', title_uz: '',
  price_sum: '',
  boarding_fee_sum: '',
  term_months: '',
  meat_weight_kg: '',
  slots_total: '1',
  status: 'active',
}

export default function Products() {
  const language = useStore(s => s.language)
  const t = useT(language)

  const [products, setProducts] = useState([])
  const [animals, setAnimals] = useState([])
  const [enabled, setEnabled] = useState(MODELS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [modelFilter, setModelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/admin/products'),
      api.get('/admin/animals'),
      api.get('/models'),
    ])
      .then(([p, a, m]) => {
        setProducts(p.products || [])
        setAnimals(a.animals || [])
        setEnabled(m.models || MODELS)
      })
      .catch(e => alert(t('common.error') + ': ' + e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Свободные животные: те, что не заняты активным оффером ownership.
  // Редактируемый оффер своё животное сохраняет, иначе его нельзя было бы
  // сохранить, не меняя животное.
  const freeAnimals = useMemo(() => {
    const taken = new Set(
      products
        .filter(p => ANIMAL_MODELS.includes(p.model_type) && p.animal_id && p.id !== editing?.id)
        .map(p => p.animal_id)
    )
    return animals.filter(a => !taken.has(a.id) && (a.status === 'active' || a.id === editing?.animal_id))
  }, [animals, products, editing])

  const filtered = useMemo(() => products.filter(p => {
    if (modelFilter !== 'all' && p.model_type !== modelFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    return true
  }), [products, modelFilter, statusFilter])

  const toPayload = (f) => {
    const base = {
      model_type: f.model_type,
      title_en: f.title_en.trim() || null,
      title_ru: f.title_ru.trim() || null,
      title_uz: f.title_uz.trim() || null,
      slots_total: Number(f.slots_total) || 1,
      status: f.status,
    }
    if (ANIMAL_MODELS.includes(f.model_type)) {
      const animal = animals.find(a => a.id === Number(f.animal_id))
      return {
        ...base,
        animal_id: Number(f.animal_id) || null,
        farm_id: animal?.farm_id || null,
        price_tiyin: Math.round(Number(f.price_sum) * 100) || 0,
        // Пусто — бэкенд подставит значение по умолчанию из настроек
        boarding_fee_monthly_tiyin: f.boarding_fee_sum
          ? Math.round(Number(f.boarding_fee_sum) * 100)
          : null,
      }
    }
    return {
      ...base,
      price_tiyin: Math.round(Number(f.price_sum) * 100) || 0,
      term_months: Number(f.term_months) || null,
      meat_weight_g: f.meat_weight_kg ? Math.round(Number(f.meat_weight_kg) * 1000) : null,
    }
  }

  const toForm = (p) => ({
    model_type: p.model_type,
    animal_id: p.animal_id ? String(p.animal_id) : '',
    title_en: p.title_en || '', title_ru: p.title_ru || '', title_uz: p.title_uz || '',
    price_sum: p.price_tiyin ? String(Math.floor(p.price_tiyin / 100)) : '',
    boarding_fee_sum: p.boarding_fee_monthly_tiyin ? String(Math.floor(p.boarding_fee_monthly_tiyin / 100)) : '',
    term_months: p.term_months ? String(p.term_months) : '',
    meat_weight_kg: p.meat_weight_g ? String(p.meat_weight_g / 1000) : '',
    slots_total: String(p.slots_total || 1),
    status: p.status,
  })

  const submit = async () => {
    setSaving(true)
    try {
      if (editing) await api.put(`/admin/products/${editing.id}`, toPayload(form))
      else await api.post('/admin/products', toPayload(form))
      setShowForm(false); setEditing(null); setForm(EMPTY_FORM)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  const remove = async (p) => {
    if (!confirm(t('products.deleteConfirm'))) return
    try {
      const res = await api.delete(`/admin/products/${p.id}`)
      if (res.closed_instead_of_deleted) alert(t('products.closedInstead'))
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
  }

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, model_type: enabled[0] || 'ownership' })
    setEditing(null); setShowForm(true)
  }
  const openEdit = (p) => { setForm(toForm(p)); setEditing(p); setShowForm(true) }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const canSave = ANIMAL_MODELS.includes(form.model_type)
    ? !!form.animal_id && !!form.price_sum
    : !!form.price_sum && !!form.term_months && !!form.meat_weight_kg

  // Что показать в колонке «условия» — у каждой модели своё
  const terms = (p) => {
    if (p.model_type === 'installment') {
      return `${p.term_months} ${t('contracts.months')} · ${(p.meat_weight_g || 0) / 1000} kg`
    }
    const fee = p.boarding_fee_monthly_tiyin
    return (p.animal_name || t('common.none'))
      + (fee ? ` · ${formatSum(fee, language)}/${t('contracts.months')}` : '')
  }

  return (
    <Layout title={t('products.title')}>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('products.title')} ({filtered.length})</span>
          <button className="btn btn-primary" onClick={openAdd}>{t('products.addBtn')}</button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <select className="form-select" style={{ width: 'auto' }} value={modelFilter} onChange={e => setModelFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {MODELS.map(m => <option key={m} value={m}>{t('models.' + m)}</option>)}
          </select>
          <select className="form-select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">{t('common.all')}</option>
            {['draft', 'active', 'sold_out', 'closed'].map(s => (
              <option key={s} value={s}>{t(statusKey(s))}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🏷️</div>
            {t('products.notFound')}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('products.modelType')}</th>
                  <th>{t('products.titleField')}</th>
                  <th>{t('products.term')}</th>
                  <th>{t('products.price')}</th>
                  <th>{t('products.slots')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>
                      <span className="badge badge-blue">{t('models.' + p.model_type)}</span>
                      {!enabled.includes(p.model_type) && (
                        <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>
                          {t('products.modelDisabled')}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {p['title_' + language] || p.title_en || t('common.none')}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{terms(p)}</td>
                    <td>
                      {formatSum(p.price_tiyin, language)}
                    </td>
                    <td>{p.slots_taken}/{p.slots_total}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[p.status] || 'badge-blue'}`}>
                        {t(statusKey(p.status))}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(p)}>{t('common.edit')}</button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>{t('common.delete')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? t('products.editTitle') : t('products.addTitle')}</div>

            <div className="form-group">
              <label className="form-label">{t('products.modelType')}</label>
              <select className="form-select" value={form.model_type} onChange={set('model_type')} disabled={!!editing}>
                {MODELS.map(m => (
                  <option key={m} value={m} disabled={!enabled.includes(m)}>
                    {t('models.' + m)}{enabled.includes(m) ? '' : ' — ' + t('products.modelDisabled')}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('products.titleField')} (EN)</label>
              <input className="form-input" placeholder={t('products.titlePh')} value={form.title_en} onChange={set('title_en')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('products.titleField')} (RU)</label>
              <input className="form-input" value={form.title_ru} onChange={set('title_ru')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('products.titleField')} (UZ)</label>
              <input className="form-input" value={form.title_uz} onChange={set('title_uz')} />
            </div>

            {/* Дальше поля зависят от модели */}
            {ANIMAL_MODELS.includes(form.model_type) && (
              <>
                <div className="form-group">
                  <label className="form-label">{t('products.animal')}</label>
                  <SearchSelect
                    value={form.animal_id}
                    onChange={v => setForm(f => ({ ...f, animal_id: v }))}
                    placeholder={t('products.chooseAnimal')}
                    searchPlaceholder={t('common.search')}
                    emptyText={t('animals.notFound')}
                    options={freeAnimals.map(a => ({
                      value: a.id,
                      label: `#${a.id} ${a.name} · ${t('animals.' + a.species)}`,
                      hint: a.current_weight_g ? `${(a.current_weight_g / 1000).toFixed(1)} kg` : '',
                      search: [a.breed, a.rfid_tag].filter(Boolean).join(' '),
                    }))}
                  />
                  {freeAnimals.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>
                      {t('products.noFreeAnimals')}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products.price')}</label>
                  <input className="form-input" type="number" value={form.price_sum} onChange={set('price_sum')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products.boardingFeeMonthly')}</label>
                  <input className="form-input" type="number" value={form.boarding_fee_sum} onChange={set('boarding_fee_sum')} />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    {t('products.boardingHint')}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products.exitLabel')}</label>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {form.model_type === 'investment' ? t('products.exitSale') : t('products.exitMeat')}
                  </div>
                </div>
              </>
            )}

            {form.model_type === 'installment' && (
              <>
                <div className="form-group">
                  <label className="form-label">{t('products.price')}</label>
                  <input className="form-input" type="number" value={form.price_sum} onChange={set('price_sum')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products.termMonths')}</label>
                  <input className="form-input" type="number" value={form.term_months} onChange={set('term_months')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('products.meatWeightKg')}</label>
                  <input className="form-input" type="number" value={form.meat_weight_kg} onChange={set('meat_weight_kg')} />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">{t('products.slotsTotal')}</label>
              <input
                className="form-input" type="number" min="1"
                value={form.slots_total} onChange={set('slots_total')}
                disabled={ANIMAL_MODELS.includes(form.model_type)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('common.status')}</label>
              <select className="form-select" value={form.status} onChange={set('status')}>
                {['draft', 'active', 'sold_out', 'closed'].map(s => (
                  <option key={s} value={s}>{t(statusKey(s))}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving || !canSave} onClick={submit}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null) }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
