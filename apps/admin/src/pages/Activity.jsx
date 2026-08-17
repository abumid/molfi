import { useState, useEffect } from 'react'
import Layout from '../Layout'
import { api, formatDate } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'
import SearchSelect from '../components/SearchSelect'

const EVENT_TYPES = ['feeding', 'weighing', 'vet', 'video']

const TYPE_LABELS = {
  feeding:  { ru: 'Кормление',  uz: 'Oziqlantirish', badge: 'badge-green' },
  weighing: { ru: 'Взвешивание', uz: "Og'irlash",    badge: 'badge-green' },
  vet:      { ru: 'Ветеринар',  uz: 'Veterinar',     badge: 'badge-blue'  },
  video:    { ru: 'Видео',      uz: 'Video',         badge: 'badge-gold'  },
}

const EMPTY_FORM = {
  type: 'feeding',
  title_ru: '', title_uz: '',
  description_ru: '', description_uz: '',
  weight_kg: '', delta_kg: '',
  vet_result_ru: 'Здоров',
  video_duration: '', video_location_ru: '', video_location_uz: '',
}

function renderMeta(type, meta) {
  if (!meta) return '—'
  switch (type) {
    case 'weighing':
      return `${meta.weight_kg} кг / +${meta.delta_kg} кг`
    case 'vet':
      return meta.result_ru === 'Здоров'
        ? <span style={{ color: '#6fcf4a' }}>Здоров</span>
        : <span style={{ color: '#e05555' }}>Лечение</span>
    case 'video':
      return `${meta.duration} · ${meta.location_ru}`
    default:
      return '—'
  }
}

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

  useEffect(() => {
    api.get('/admin/animals')
      .then(d => {
        const list = d.animals || []
        setAnimals(list)
        if (list.length > 0) setSelectedAnimalId(String(list[0].id))
      })
      .catch(console.error)
  }, [])

  const loadEvents = (animalId) => {
    if (!animalId) return
    setLoading(true)
    api.get(`/animals/${animalId}/activity?limit=50`)
      .then(d => {
        setEvents(d.data?.items || [])
        setTotal(d.data?.total || 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    if (selectedAnimalId) loadEvents(selectedAnimalId)
  }, [selectedAnimalId])

  const handleAdd = async () => {
    if (!selectedAnimalId) return
    setSaving(true)
    try {
      let meta = null
      if (form.type === 'weighing') {
        meta = { weight_kg: Number(form.weight_kg), delta_kg: Number(form.delta_kg) }
      } else if (form.type === 'vet') {
        meta = {
          result_ru: form.vet_result_ru,
          result_uz: form.vet_result_ru === 'Здоров' ? "Sog'lom" : 'Davolanish',
        }
      } else if (form.type === 'video') {
        meta = {
          duration: form.video_duration,
          location_ru: form.video_location_ru,
          location_uz: form.video_location_uz,
          url: null,
        }
      }
      await api.post(`/animals/${selectedAnimalId}/activity`, {
        type: form.type,
        title_ru: form.title_ru.trim(),
        title_uz: form.title_uz.trim(),
        description_ru: form.description_ru.trim() || null,
        description_uz: form.description_uz.trim() || null,
        meta,
      })
      setShowAdd(false)
      setForm(EMPTY_FORM)
      loadEvents(selectedAnimalId)
    } catch (e) {
      alert((language === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + e.message)
    }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (!confirm(language === 'uz'
      ? "Voqeani o'chirishni tasdiqlaysizmi?"
      : 'Удалить событие?'
    )) return
    try {
      await api.delete(`/activity/${id}`)
      setEvents(prev => prev.filter(e => e.id !== id))
    } catch (e) {
      alert((language === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + e.message)
    }
  }

  const openEdit = (ev) => {
    setEditItem(ev)
    setEditForm({
      title_ru: ev.title_ru || '',
      title_uz: ev.title_uz || '',
      description_ru: ev.description_ru || '',
      description_uz: ev.description_uz || '',
      weight_kg: ev.meta?.weight_kg ?? '',
      delta_kg: ev.meta?.delta_kg ?? '',
      vet_result_ru: ev.meta?.result_ru || 'Здоров',
      video_duration: ev.meta?.duration || '',
      video_location_ru: ev.meta?.location_ru || '',
      video_location_uz: ev.meta?.location_uz || '',
    })
  }

  const handleSave = async () => {
    if (!editItem) return
    setSaving(true)
    try {
      let meta = null
      if (editItem.type === 'weighing') {
        meta = { weight_kg: Number(editForm.weight_kg), delta_kg: Number(editForm.delta_kg) }
      } else if (editItem.type === 'vet') {
        meta = {
          result_ru: editForm.vet_result_ru,
          result_uz: editForm.vet_result_ru === 'Здоров' ? "Sog'lom" : 'Davolanish',
        }
      } else if (editItem.type === 'video') {
        meta = {
          duration: editForm.video_duration,
          location_ru: editForm.video_location_ru,
          location_uz: editForm.video_location_uz,
          url: editItem.meta?.url ?? null,
        }
      }
      const updated = await api.put(`/activity/${editItem.id}`, {
        title_ru: editForm.title_ru.trim(),
        title_uz: editForm.title_uz.trim(),
        description_ru: editForm.description_ru.trim() || null,
        description_uz: editForm.description_uz.trim() || null,
        meta,
      })
      setEvents(prev => prev.map(a =>
        a.id === editItem.id ? { ...a, ...updated.data } : a
      ))
      setEditItem(null)
    } catch (e) {
      alert((language === 'uz' ? 'Xatolik: ' : 'Ошибка: ') + e.message)
    }
    setSaving(false)
  }

  const filtered = typeFilter === 'all'
    ? events
    : events.filter(e => e.type === typeFilter)

  const selectedAnimal = animals.find(s => String(s.id) === selectedAnimalId)

  return (
    <Layout title={language === 'uz' ? 'Faoliyat' : 'Активность'}>
      <div className="card">
        <div className="card-title">
          {language === 'uz' ? 'Faoliyat lentasi' : 'Лента активности'}
          {' '}
          {!loading && selectedAnimalId && (
            <span style={{ color: '#8892a4', fontWeight: 400, fontSize: 14 }}>
              ({total})
            </span>
          )}
          <button
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => setShowAdd(true)}
          >
            + {language === 'uz' ? "Voqea qo'shish" : 'Добавить событие'}
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
              {tp === 'all'
                ? (language === 'uz' ? 'Barchasi' : 'Все')
                : (language === 'uz' ? TYPE_LABELS[tp]?.uz : TYPE_LABELS[tp]?.ru)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('common.id')}</th>
                  <th>{language === 'uz' ? 'Tur' : 'Тип'}</th>
                  <th>{language === 'uz' ? 'Sarlavha' : 'Заголовок'}</th>
                  <th>{language === 'uz' ? 'Tavsif' : 'Описание'}</th>
                  <th>Meta</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ev => {
                  const lbl = TYPE_LABELS[ev.type] || TYPE_LABELS.feeding
                  return (
                    <tr key={ev.id}>
                      <td style={{ color: '#8892a4' }}>#{ev.id}</td>
                      <td>
                        <span className={`badge ${lbl.badge}`}>
                          {language === 'uz' ? lbl.uz : lbl.ru}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {language === 'uz' ? ev.title_uz : ev.title_ru}
                        <div style={{ fontSize: 11, color: '#8892a4', fontWeight: 400 }}>
                          {language === 'uz' ? ev.title_ru : ev.title_uz}
                        </div>
                      </td>
                      <td style={{ maxWidth: 220, color: '#8892a4', fontSize: 13 }}>
                        {(language === 'uz' ? ev.description_uz : ev.description_ru) || '—'}
                      </td>
                      <td style={{ fontSize: 12, color: '#8892a4' }}>
                        {renderMeta(ev.type, ev.meta)}
                      </td>
                      <td style={{ color: '#8892a4', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {formatDate(ev.created_at)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEdit(ev)}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(ev.id)}
                          >
                            {t('common.delete')}
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
                <div className="empty-icon">📋</div>
                {language === 'uz' ? 'Voqealar topilmadi' : 'События не найдены'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-title">
              + {language === 'uz' ? 'Yangi voqea' : 'Новое событие'}
              {selectedAnimal && (
                <span style={{ fontSize: 13, color: '#8892a4', fontWeight: 400 }}>
                  {' '}— {selectedAnimal.name}
                </span>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>✕</button>
            </div>

            <div className="form-group">
              <label className="form-label">{language === 'uz' ? 'Tur' : 'Тип события'}</label>
              <select
                className="form-select"
                value={form.type}
                onChange={e => setForm(p => ({ ...EMPTY_FORM, type: e.target.value }))}
              >
                {EVENT_TYPES.map(tp => (
                  <option key={tp} value={tp}>
                    {language === 'uz' ? TYPE_LABELS[tp].uz : TYPE_LABELS[tp].ru}
                  </option>
                ))}
              </select>
            </div>

            {[
              ['title_ru', 'Заголовок (RU)', 'Кормление'],
              ['title_uz', 'Sarlavha (UZ)', 'Oziqlantirish'],
            ].map(([key, label, ph]) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" placeholder={ph} value={form[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}

            {[
              ['description_ru', 'Описание (RU)'],
              ['description_uz', 'Tavsif (UZ)'],
            ].map(([key, label]) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" value={form[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}

            {form.type === 'weighing' && (
              <>
                <div className="form-group">
                  <label className="form-label">{language === 'uz' ? "Og'irlik (kg)" : 'Вес (кг)'}</label>
                  <input className="form-input" type="number" placeholder="52.5"
                    value={form.weight_kg}
                    onChange={e => setForm(p => ({ ...p, weight_kg: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{language === 'uz' ? "O'sish (kg/haf)" : 'Прирост (кг/нед)'}</label>
                  <input className="form-input" type="number" placeholder="2.3"
                    value={form.delta_kg}
                    onChange={e => setForm(p => ({ ...p, delta_kg: e.target.value }))} />
                </div>
              </>
            )}

            {form.type === 'vet' && (
              <div className="form-group">
                <label className="form-label">{language === 'uz' ? 'Natija' : 'Результат осмотра'}</label>
                <select className="form-select" value={form.vet_result_ru}
                  onChange={e => setForm(p => ({ ...p, vet_result_ru: e.target.value }))}>
                  <option value="Здоров">{language === 'uz' ? "Sog'lom" : 'Здоров'}</option>
                  <option value="Лечение">{language === 'uz' ? 'Davolash' : 'Лечение'}</option>
                </select>
              </div>
            )}

            {form.type === 'video' && (
              <>
                <div className="form-group">
                  <label className="form-label">{language === 'uz' ? 'Davomiylik' : 'Длительность'}</label>
                  <input className="form-input" placeholder="1:30"
                    value={form.video_duration}
                    onChange={e => setForm(p => ({ ...p, video_duration: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{language === 'uz' ? 'Joylashuv (RU)' : 'Место съёмки (RU)'}</label>
                  <input className="form-input" placeholder="Ферма Ташкент"
                    value={form.video_location_ru}
                    onChange={e => setForm(p => ({ ...p, video_location_ru: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Joylashuv (UZ)</label>
                  <input className="form-input" placeholder="Toshkent fermasi"
                    value={form.video_location_uz}
                    onChange={e => setForm(p => ({ ...p, video_location_uz: e.target.value }))} />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={handleAdd}
                disabled={saving || !form.title_ru.trim() || !form.title_uz.trim()}
                style={{ flex: 1 }}>
                {saving
                  ? (language === 'uz' ? "Qo'shilmoqda..." : 'Добавление...')
                  : (language === 'uz' ? "Qo'shish" : 'Добавить')}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)} style={{ flex: 1 }}>
                {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-title">
              {language === 'uz' ? "Voqeani tahrirlash" : 'Редактировать событие'}
              <span style={{ fontSize: 13, color: '#8892a4', fontWeight: 400 }}>
                {' '}#{editItem.id}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditItem(null)}>✕</button>
            </div>

            {/* Type — disabled */}
            <div className="form-group">
              <label className="form-label">{language === 'uz' ? 'Tur' : 'Тип события'}</label>
              <select className="form-select" value={editItem.type} disabled>
                {EVENT_TYPES.map(tp => (
                  <option key={tp} value={tp}>
                    {language === 'uz' ? TYPE_LABELS[tp].uz : TYPE_LABELS[tp].ru}
                  </option>
                ))}
              </select>
            </div>

            {/* Titles */}
            {[
              ['title_ru', 'Заголовок (RU)'],
              ['title_uz', 'Sarlavha (UZ)'],
            ].map(([key, label]) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <input className="form-input" value={editForm[key] || ''}
                  onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}

            {/* Descriptions */}
            {[
              ['description_ru', 'Описание (RU)'],
              ['description_uz', 'Tavsif (UZ)'],
            ].map(([key, label]) => (
              <div className="form-group" key={key}>
                <label className="form-label">{label}</label>
                <textarea className="form-input" rows={2}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  value={editForm[key] || ''}
                  onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}

            {/* Meta fields by type */}
            {editItem.type === 'weighing' && (
              <>
                <div className="form-group">
                  <label className="form-label">{language === 'uz' ? "Og'irlik (kg)" : 'Вес (кг)'}</label>
                  <input className="form-input" type="number"
                    value={editForm.weight_kg}
                    onChange={e => setEditForm(p => ({ ...p, weight_kg: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{language === 'uz' ? "O'sish (kg/haf)" : 'Прирост (кг/нед)'}</label>
                  <input className="form-input" type="number"
                    value={editForm.delta_kg}
                    onChange={e => setEditForm(p => ({ ...p, delta_kg: e.target.value }))} />
                </div>
              </>
            )}

            {editItem.type === 'vet' && (
              <div className="form-group">
                <label className="form-label">{language === 'uz' ? 'Natija' : 'Результат осмотра'}</label>
                <select className="form-select" value={editForm.vet_result_ru}
                  onChange={e => setEditForm(p => ({ ...p, vet_result_ru: e.target.value }))}>
                  <option value="Здоров">{language === 'uz' ? "Sog'lom" : 'Здоров'}</option>
                  <option value="Лечение">{language === 'uz' ? 'Davolanish' : 'Лечение'}</option>
                </select>
              </div>
            )}

            {editItem.type === 'video' && (
              <>
                <div className="form-group">
                  <label className="form-label">{language === 'uz' ? 'Davomiylik' : 'Длительность'}</label>
                  <input className="form-input" placeholder="0:42"
                    value={editForm.video_duration}
                    onChange={e => setEditForm(p => ({ ...p, video_duration: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{language === 'uz' ? 'Joylashuv (RU)' : 'Место съёмки (RU)'}</label>
                  <input className="form-input"
                    value={editForm.video_location_ru}
                    onChange={e => setEditForm(p => ({ ...p, video_location_ru: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Joylashuv (UZ)</label>
                  <input className="form-input"
                    value={editForm.video_location_uz}
                    onChange={e => setEditForm(p => ({ ...p, video_location_uz: e.target.value }))} />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={handleSave}
                disabled={saving || !editForm.title_ru?.trim() || !editForm.title_uz?.trim()}
                style={{ flex: 1 }}>
                {saving
                  ? (language === 'uz' ? 'Saqlanmoqda...' : 'Сохранение...')
                  : (language === 'uz' ? 'Saqlash' : 'Сохранить')}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditItem(null)} style={{ flex: 1 }}>
                {language === 'uz' ? 'Bekor qilish' : 'Отмена'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
