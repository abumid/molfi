import { useState, useEffect } from 'react'
import Layout from '../Layout'
import { api, formatDate } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'
import SearchSelect from '../components/SearchSelect'

const EVENT_TYPES = ['feeding', 'weighing', 'vet', 'video']
const BADGE = { feeding: 'badge-green', weighing: 'badge-green', vet: 'badge-blue', video: 'badge-gold' }
const LANGS = ['en', 'ru', 'uz']

const EMPTY_FORM = {
  type: 'feeding',
  title_en: '', title_ru: '', title_uz: '',
  description_en: '', description_ru: '', description_uz: '',
  weight_kg: '', delta_kg: '',
  vet_result: 'healthy',
  video_duration: '', video_location: '',
}

/**
 * The inspection result is stored under the key healthy / treatment, not as a
 * word. Russian text used as a value broke the moment the wording was edited,
 * and the backend did not accept it anyway — it expected a key from the start,
 * which is why the vet event was never created at all.
 * Old records carrying result_ru are still read so the history does not fall apart.
 */
const vetResultOf = (meta) => {
  if (!meta) return null
  if (meta.result) return meta.result
  if (meta.result_ru) return meta.result_ru === 'Здоров' ? 'healthy' : 'treatment'
  return null
}

const videoPlaceOf = (meta, language) =>
  meta?.location || meta?.[`location_${language}`] || meta?.location_ru || ''

export default function Activity() {
  const { language } = useStore()
  const t = useT(language)

  const [animals, setAnimals] = useState([])
  const [selectedAnimalId, setSelectedAnimalId] = useState('')
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [typeFilter, setTypeFilter] = useState('all')
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [tab, setTab] = useState('en')
  const [formError, setFormError] = useState(null)

  useEffect(() => {
    api.get('/admin/animals')
      .then(d => {
        const list = d.animals || []
        setAnimals(list)
        if (list.length > 0) setSelectedAnimalId(String(list[0].id))
      })
      .catch(e => alert(t('common.error') + ': ' + e.message))
  }, [])

  const loadEvents = (animalId) => {
    if (!animalId) return Promise.resolve()
    return api.get(`/animals/${animalId}/activity?limit=50`)
      .then(d => {
        setEvents(d.data?.items || [])
        setTotal(d.data?.total || 0)
      })
      .catch(e => alert(t('common.error') + ': ' + e.message))
  }

  useEffect(() => {
    if (!selectedAnimalId) return
    // Liveness flag: switching animals quickly can make the response for the
    // first arrive last and fill the feed with someone else's events
    let alive = true
    const run = async () => {
      setLoading(true)
      await loadEvents(selectedAnimalId)
      if (alive) setLoading(false)
    }
    run()
    return () => { alive = false }
  }, [selectedAnimalId])

  const metaFrom = (f, type, keepUrl = null) => {
    if (type === 'weighing') {
      return { weight_kg: Number(f.weight_kg), delta_kg: Number(f.delta_kg) || 0 }
    }
    if (type === 'vet') return { result: f.vet_result }
    if (type === 'video') {
      return { duration: f.video_duration || null, location: f.video_location || null, url: keepUrl }
    }
    return null
  }

  const hasTitle = (f) => LANGS.some(l => (f['title_' + l] || '').trim())

  const payloadFrom = (f) => ({
    title_en: f.title_en.trim() || null,
    title_ru: f.title_ru.trim() || null,
    title_uz: f.title_uz.trim() || null,
    description_en: f.description_en.trim() || null,
    description_ru: f.description_ru.trim() || null,
    description_uz: f.description_uz.trim() || null,
  })

  const handleAdd = async () => {
    if (!selectedAnimalId) return
    if (!hasTitle(form)) return setFormError(t('activity.titleRequired'))
    setSaving(true)
    setFormError(null)
    try {
      await api.post(`/animals/${selectedAnimalId}/activity`, {
        type: form.type,
        ...payloadFrom(form),
        meta: metaFrom(form, form.type),
      })
      setShowAdd(false)
      setForm(EMPTY_FORM)
      loadEvents(selectedAnimalId)
    } catch (e) {
      setFormError(e.message)
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm(t('activity.deleteConfirm'))) return
    try {
      await api.delete(`/activity/${id}`)
      setEvents(prev => prev.filter(e => e.id !== id))
      setTotal(n => Math.max(0, n - 1))
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
  }

  const openEdit = (ev) => {
    setEditItem(ev)
    setFormError(null)
    setTab(language)
    setEditForm({
      title_en: ev.title_en || '', title_ru: ev.title_ru || '', title_uz: ev.title_uz || '',
      description_en: ev.description_en || '',
      description_ru: ev.description_ru || '',
      description_uz: ev.description_uz || '',
      weight_kg: ev.meta?.weight_kg ?? '',
      delta_kg: ev.meta?.delta_kg ?? '',
      vet_result: vetResultOf(ev.meta) || 'healthy',
      video_duration: ev.meta?.duration || '',
      video_location: videoPlaceOf(ev.meta, language),
    })
  }

  const handleSave = async () => {
    if (!editItem) return
    if (!hasTitle(editForm)) return setFormError(t('activity.titleRequired'))
    setSaving(true)
    setFormError(null)
    try {
      const updated = await api.put(`/activity/${editItem.id}`, {
        ...payloadFrom(editForm),
        meta: metaFrom(editForm, editItem.type, editItem.meta?.url ?? null),
      })
      setEvents(prev => prev.map(a => (a.id === editItem.id ? { ...a, ...updated.data } : a)))
      setEditItem(null)
    } catch (e) {
      setFormError(e.message)
    }
    setSaving(false)
  }

  const filtered = typeFilter === 'all' ? events : events.filter(e => e.type === typeFilter)
  const selectedAnimal = animals.find(s => String(s.id) === selectedAnimalId)

  const renderMeta = (ev) => {
    const m = ev.meta
    if (!m) return t('common.none')
    if (ev.type === 'weighing') {
      const delta = Number(m.delta_kg) || 0
      return `${m.weight_kg} kg${delta ? ` · ${delta > 0 ? '+' : ''}${delta} kg` : ''}`
    }
    if (ev.type === 'vet') {
      const r = vetResultOf(m)
      return (
        <span style={{ color: r === 'healthy' ? 'var(--accent)' : 'var(--red)' }}>
          {t('activity.' + (r === 'healthy' ? 'healthy' : 'treatment'))}
        </span>
      )
    }
    if (ev.type === 'video') {
      return [m.duration, videoPlaceOf(m, language)].filter(Boolean).join(' · ') || t('common.none')
    }
    return t('common.none')
  }

  /** Event translations go in tabs: six fields in a row cannot be read. */
  const langTabs = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {LANGS.map(l => (
        <button
          key={l}
          className={`btn btn-sm ${tab === l ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab(l)}
          style={{ textTransform: 'uppercase', minWidth: 46 }}
        >
          {l}
        </button>
      ))}
    </div>
  )

  const textFields = (f, setF) => (
    <>
      {langTabs}
      <div className="form-group">
        <label className="form-label">{t('activity.heading')}</label>
        <input
          className="form-input"
          value={f['title_' + tab] || ''}
          onChange={e => setF(p => ({ ...p, ['title_' + tab]: e.target.value }))}
        />
      </div>
      <div className="form-group">
        <label className="form-label">{t('activity.descr')}</label>
        <textarea
          className="form-input" rows={2}
          style={{ resize: 'vertical', fontFamily: 'inherit' }}
          value={f['description_' + tab] || ''}
          onChange={e => setF(p => ({ ...p, ['description_' + tab]: e.target.value }))}
        />
      </div>
    </>
  )

  const metaFields = (type, f, setF) => (
    <>
      {type === 'weighing' && (
        <>
          <div className="form-group">
            <label className="form-label">{t('activity.weightKg')}</label>
            <input
              className="form-input" type="number" step="0.1" placeholder="52.5"
              value={f.weight_kg}
              onChange={e => setF(p => ({ ...p, weight_kg: e.target.value }))}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {t('activity.weightHint')}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('activity.deltaKg')}</label>
            <input
              className="form-input" type="number" step="0.1" placeholder="2.3"
              value={f.delta_kg}
              onChange={e => setF(p => ({ ...p, delta_kg: e.target.value }))}
            />
          </div>
        </>
      )}

      {type === 'vet' && (
        <div className="form-group">
          <label className="form-label">{t('activity.vetResult')}</label>
          <select
            className="form-select" value={f.vet_result}
            onChange={e => setF(p => ({ ...p, vet_result: e.target.value }))}
          >
            <option value="healthy">{t('activity.healthy')}</option>
            <option value="treatment">{t('activity.treatment')}</option>
          </select>
        </div>
      )}

      {type === 'video' && (
        <>
          <div className="form-group">
            <label className="form-label">{t('activity.duration')}</label>
            <input
              className="form-input" placeholder="1:30" value={f.video_duration}
              onChange={e => setF(p => ({ ...p, video_duration: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('activity.place')}</label>
            <input
              className="form-input" value={f.video_location}
              onChange={e => setF(p => ({ ...p, video_location: e.target.value }))}
            />
          </div>
        </>
      )}
    </>
  )

  return (
    <Layout title={t('nav.activity')}>
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            {t('activity.title')}
            {!loading && selectedAnimalId && (
              <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}> ({total})</span>
            )}
          </span>
          <button
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap' }}
            disabled={!selectedAnimalId}
            onClick={() => { setForm(EMPTY_FORM); setTab(language); setFormError(null); setShowAdd(true) }}
          >
            {t('activity.addBtn')}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ width: 240 }}>
            <SearchSelect
              value={selectedAnimalId}
              onChange={setSelectedAnimalId}
              placeholder={t('products.chooseAnimal')}
              searchPlaceholder={t('common.search')}
              emptyText={t('animals.notFound')}
              options={animals.map(a => ({
                value: a.id,
                label: `#${a.id} ${a.name}`,
                hint: a.current_weight_g ? `${(a.current_weight_g / 1000).toFixed(1)} kg` : '',
                search: [a.breed, a.rfid_tag, a.species].filter(Boolean).join(' '),
              }))}
            />
          </div>

          {['all', ...EVENT_TYPES].map(tp => (
            <button
              key={tp}
              className={`btn btn-sm ${typeFilter === tp ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTypeFilter(tp)}
            >
              {t('activity.' + tp)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📋</div>
            {t('activity.notFound')}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{t('activity.eventType')}</th>
                  <th>{t('activity.heading')}</th>
                  <th>{t('activity.descr')}</th>
                  <th>{t('activity.meta')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ev => {
                  const title = ev['title_' + language] || ev.title_en || ev.title_ru || ev.title_uz
                  const descr = ev['description_' + language] || ev.description_en
                  return (
                    <tr key={ev.id}>
                      <td style={{ color: 'var(--muted)' }}>#{ev.id}</td>
                      <td>
                        <span className={`badge ${BADGE[ev.type] || 'badge-blue'}`}>
                          {t('activity.' + ev.type)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{title || t('common.none')}</td>
                      <td style={{ maxWidth: 220, color: 'var(--muted)', fontSize: 13 }}>
                        {descr || t('common.none')}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{renderMeta(ev)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {formatDate(ev.created_at, language)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(ev)}>
                            {t('common.edit')}
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(ev.id)}>
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

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-title">
              <span>
                {t('activity.newEvent')}
                {selectedAnimal && (
                  <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>
                    {' '}— {selectedAnimal.name}
                  </span>
                )}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>✕</button>
            </div>

            <div className="form-group">
              <label className="form-label">{t('activity.eventType')}</label>
              <select
                className="form-select" value={form.type}
                onChange={e => setForm(() => ({ ...EMPTY_FORM, type: e.target.value }))}
              >
                {EVENT_TYPES.map(tp => (
                  <option key={tp} value={tp}>{t('activity.' + tp)}</option>
                ))}
              </select>
            </div>

            {textFields(form, setForm)}
            {metaFields(form.type, form, setForm)}

            {formError && (
              <p style={{ color: 'var(--red)', fontSize: 13, margin: '4px 0' }}>{formError}</p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving} style={{ flex: 1 }}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)} style={{ flex: 1 }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-title">
              <span>
                {t('activity.editEvent')}
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}> #{editItem.id}</span>
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditItem(null)}>✕</button>
            </div>

            {/* The type cannot be changed: the meta form depends on it, and
                switching would orphan the details already recorded */}
            <div className="form-group">
              <label className="form-label">{t('activity.eventType')}</label>
              <select className="form-select" value={editItem.type} disabled>
                <option value={editItem.type}>{t('activity.' + editItem.type)}</option>
              </select>
            </div>

            {textFields(editForm, setEditForm)}
            {metaFields(editItem.type, editForm, setEditForm)}

            {formError && (
              <p style={{ color: 'var(--red)', fontSize: 13, margin: '4px 0' }}>{formError}</p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditItem(null)} style={{ flex: 1 }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
