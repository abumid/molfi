import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAdmin } from '../middleware/auth.js'
import { getSettings, invalidateSettings, ALL_MODELS } from '../utils/settings.js'

const router = Router()

// Ставки храним в базисных пунктах, а показываем в процентах.
// Список — чтобы админка знала, какие поля рисовать со знаком %.
const BP_KEYS = ['platform_fee_bp', 'late_fee_bp']

const INT_KEYS = [
  'platform_fee_bp', 'late_fee_bp', 'boarding_fee_monthly_tiyin',
  'min_investment_tiyin', 'overdue_grace_days', 'default_after_missed',
]

const validate = (key, value) => {
  if (key === 'models_enabled') {
    const list = String(value).split(',').map(s => s.trim()).filter(Boolean)
    if (!list.length) return 'models_enabled cannot be empty'
    const bad = list.filter(m => !ALL_MODELS.includes(m))
    if (bad.length) return `unknown models: ${bad.join(', ')}`
    return null
  }
  if (INT_KEYS.includes(key)) {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0) return `${key} must be a non-negative integer`
    if (key === 'platform_fee_bp' && n > 10000) return 'platform_fee_bp cannot exceed 10000 (100%)'
  }
  return null
}

router.get('/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
  const rows = (await pool.query(
    `SELECT key, value, comment, updated_at FROM settings ORDER BY key`
  )).rows
  ok(res, { settings: rows, bp_keys: BP_KEYS, all_models: ALL_MODELS })
}))

router.put('/admin/settings', requireAdmin, asyncHandler(async (req, res) => {
  const patch = req.body?.settings || req.body
  if (!patch || typeof patch !== 'object') return fail(res, 'settings object required')

  const entries = Object.entries(patch).filter(([k]) => k !== 'settings')
  if (!entries.length) return fail(res, 'nothing to update')

  for (const [key, value] of entries) {
    const err = validate(key, value)
    if (err) return fail(res, err)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [key, value] of entries) {
      await client.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  // Без сброса админ ждал бы до минуты, гадая, применилось ли
  invalidateSettings()

  ok(res, { settings: await getSettings() })
}))

export default router
