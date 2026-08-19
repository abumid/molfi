// Reading the settings table with an in-memory cache.
//
// Settings change rarely but are read on every fee calculation, so hitting
// the database every time is pointless. The cache lives 60 seconds; after
// PUT /api/admin/settings it is dropped by hand via invalidateSettings(), so
// the admin sees the effect at once instead of a minute later.

import { pool } from '../db/pool.js'

const TTL_MS = 60 * 1000

// Values used when the row is missing from the database entirely. They match
// what the migration seeds, so behaviour cannot drift apart.
const FALLBACK = {
  boarding_fee_monthly_tiyin: '4000000',
  purchase_fee_bp: '0',
  profit_fee_client_bp: '0',
  profit_fee_farm_bp: '0',
  late_fee_bp: '0',
  overdue_grace_days: '5',
  default_after_missed: '3',
  models_enabled: 'investment,ownership',
}

export const ALL_MODELS = ['investment', 'ownership', 'installment']

let cache = null
let loadedAt = 0
let inflight = null

const isStale = () => !cache || Date.now() - loadedAt > TTL_MS

const load = async () => {
  const { rows } = await pool.query(`SELECT key, value FROM settings`)
  cache = Object.fromEntries(rows.map(r => [r.key, r.value]))
  loadedAt = Date.now()
  return cache
}

/**
 * All settings at once. Concurrent calls on a cold cache collapse into a
 * single query — otherwise a loaded start-up would fire a dozen identical
 * SELECTs.
 */
export const getSettings = async () => {
  if (!isStale()) return cache
  if (inflight) return inflight
  inflight = load().finally(() => { inflight = null })
  return inflight
}

/** A setting as a string. */
export const getSetting = async (key) => {
  const s = await getSettings()
  return s[key] ?? FALLBACK[key] ?? null
}

/**
 * A setting as a number. Returns the fallback when the stored value is junk —
 * silently returning NaN is worse than working off the default.
 */
export const getSettingInt = async (key) => {
  const raw = await getSetting(key)
  const n = Number.parseInt(raw, 10)
  if (Number.isFinite(n)) return n
  const fb = Number.parseInt(FALLBACK[key] ?? '', 10)
  return Number.isFinite(fb) ? fb : 0
}

/** Drop the cache. Call after any write to settings. */
export const invalidateSettings = () => {
  cache = null
  loadedAt = 0
}

/** Default monthly boarding fee. An offer may override it. */
export const boardingFeeMonthly = () => getSettingInt('boarding_fee_monthly_tiyin')

/**
 * Tariffs as a single object — the math needs all three at once, and fetching
 * them one by one would walk the same cache three times.
 */
export const feeRates = async () => ({
  purchaseFeeBp: await getSettingInt('purchase_fee_bp'),
  profitFeeClientBp: await getSettingInt('profit_fee_client_bp'),
  profitFeeFarmBp: await getSettingInt('profit_fee_farm_bp'),
})

/**
 * Which models are currently open. Kept in settings rather than in code so a
 * model can be enabled or hidden without a deploy. Junk values are ignored,
 * but an empty list is never returned — the catalogue would die silently.
 */
export const enabledModels = async () => {
  const raw = await getSetting('models_enabled')
  const list = String(raw || '').split(',').map(s => s.trim()).filter(m => ALL_MODELS.includes(m))
  return list.length ? list : [...ALL_MODELS]
}

export const isModelEnabled = async (model) => (await enabledModels()).includes(model)
