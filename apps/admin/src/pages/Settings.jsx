import { useEffect, useState } from 'react'
import Layout from '../Layout'
import { api } from '../api'
import { useStore } from '../store'
import { useT } from '../i18n'

const ALL_MODELS = ['investment', 'ownership', 'installment']

// Как показывать каждую настройку. Базисные пункты и тийины хранятся
// в базе как целые, а вводятся в привычных единицах — проценты и сумы.
const FIELDS = [
  { key: 'boarding_fee_monthly_tiyin', kind: 'tiyin' },
  { key: 'purchase_fee_bp', kind: 'bp' },
  { key: 'profit_fee_client_bp', kind: 'bp' },
  { key: 'profit_fee_farm_bp', kind: 'bp' },
  { key: 'late_fee_bp', kind: 'bp' },
  { key: 'overdue_grace_days', kind: 'int', unit: 'inDays' },
  { key: 'default_after_missed', kind: 'int', unit: 'inCount' },
]

const toDisplay = (kind, raw) => {
  const n = Number(raw)
  if (!Number.isFinite(n)) return ''
  if (kind === 'bp') return String(n / 100)
  if (kind === 'tiyin') return String(Math.floor(n / 100))
  return String(n)
}

const toStored = (kind, value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (kind === 'bp') return Math.round(n * 100)
  if (kind === 'tiyin') return Math.round(n * 100)
  return Math.round(n)
}

export default function Settings() {
  const language = useStore(s => s.language)
  const t = useT(language)

  const [values, setValues] = useState({})
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/admin/settings')
      .then(d => {
        const raw = Object.fromEntries((d.settings || []).map(s => [s.key, s.value]))
        const next = {}
        for (const f of FIELDS) next[f.key] = toDisplay(f.kind, raw[f.key])
        setValues(next)
        setModels(String(raw.models_enabled || '').split(',').map(s => s.trim()).filter(Boolean))
      })
      .catch(e => alert(t('common.error') + ': ' + e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const toggleModel = (m) => {
    setModels(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  }

  const save = async () => {
    if (models.length === 0) {
      alert(t('settings.modelsHint'))
      return
    }
    setSaving(true)
    try {
      const patch = { models_enabled: models.join(',') }
      for (const f of FIELDS) {
        const stored = toStored(f.kind, values[f.key])
        if (stored !== null) patch[f.key] = stored
      }
      // Эта ручка на бэкенде сбрасывает кэш настроек, поэтому изменения
      // применяются сразу, а не через минуту
      await api.put('/admin/settings', patch)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      load()
    } catch (e) {
      alert(t('common.error') + ': ' + e.message)
    }
    setSaving(false)
  }

  if (loading) {
    return <Layout title={t('settings.title')}><div className="loading">{t('common.loading')}</div></Layout>
  }

  return (
    <Layout title={t('settings.title')}>
      <div className="card" style={{ maxWidth: 620 }}>
        <div className="card-title">{t('settings.title')}</div>

        {FIELDS.map(f => (
          <div className="form-group" key={f.key}>
            <label className="form-label">{t('settings.' + f.key)}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                className="form-input"
                type="number"
                step={f.kind === 'bp' ? '0.01' : '1'}
                value={values[f.key] ?? ''}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              />
              <span style={{ color: 'var(--muted)', fontSize: 13, minWidth: 60 }}>
                {f.kind === 'bp' ? t('settings.inPercent')
                  : f.kind === 'tiyin' ? t('settings.inSum')
                  : t('settings.' + f.unit)}
              </span>
            </div>
            {f.kind === 'bp' && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                {t('settings.percentHint')}
                {values[f.key] !== '' && Number.isFinite(Number(values[f.key]))
                  ? ` → ${toStored('bp', values[f.key])} bp`
                  : ''}
              </div>
            )}
          </div>
        ))}

        <div className="form-group">
          <label className="form-label">{t('settings.models_enabled')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {ALL_MODELS.map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={models.includes(m)}
                  onChange={() => toggleModel(m)}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                />
                {t('models.' + m)}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            {t('settings.modelsHint')}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
          {saved && <span style={{ color: 'var(--accent)', fontSize: 13 }}>✓ {t('settings.saved')}</span>}
        </div>
      </div>
    </Layout>
  )
}
