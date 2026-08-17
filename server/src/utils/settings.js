// Чтение таблицы settings с кэшем в памяти.
//
// Настройки меняются редко, а читаются на каждый расчёт комиссии — ходить
// в базу каждый раз незачем. Кэш держим 60 секунд; после PUT /api/admin/settings
// сбрасываем вручную через invalidateSettings(), чтобы админ видел эффект сразу,
// а не через минуту.

import { pool } from '../db/pool.js'

const TTL_MS = 60 * 1000

// Значения на случай, если строки в базе нет вообще. Совпадают с тем,
// что засевает миграция, — чтобы поведение не разъезжалось.
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
 * Все настройки разом. Параллельные вызовы на холодном кэше схлопываются
 * в один запрос — иначе на старте под нагрузкой получим десяток
 * одинаковых SELECT.
 */
export const getSettings = async () => {
  if (!isStale()) return cache
  if (inflight) return inflight
  inflight = load().finally(() => { inflight = null })
  return inflight
}

/** Строковое значение настройки. */
export const getSetting = async (key) => {
  const s = await getSettings()
  return s[key] ?? FALLBACK[key] ?? null
}

/**
 * Числовое значение. Возвращает fallback, если в базе мусор —
 * молча вернуть NaN хуже, чем работать по значению по умолчанию.
 */
export const getSettingInt = async (key) => {
  const raw = await getSetting(key)
  const n = Number.parseInt(raw, 10)
  if (Number.isFinite(n)) return n
  const fb = Number.parseInt(FALLBACK[key] ?? '', 10)
  return Number.isFinite(fb) ? fb : 0
}

/** Сброс кэша. Вызывать после любой записи в settings. */
export const invalidateSettings = () => {
  cache = null
  loadedAt = 0
}

/** Абонплата за содержание по умолчанию. Оффер может её переопределить. */
export const boardingFeeMonthly = () => getSettingInt('boarding_fee_monthly_tiyin')

/**
 * Тарифы одним объектом — расчётам нужны все три сразу, а ходить
 * за каждым отдельно значит трижды пройти по одному и тому же кэшу.
 */
export const feeRates = async () => ({
  purchaseFeeBp: await getSettingInt('purchase_fee_bp'),
  profitFeeClientBp: await getSettingInt('profit_fee_client_bp'),
  profitFeeFarmBp: await getSettingInt('profit_fee_farm_bp'),
})

/**
 * Какие модели сейчас открыты. Держим в settings, а не в коде, чтобы
 * включить или спрятать модель можно было без деплоя. Мусор в значении
 * игнорируем, но пустой список не отдаём — иначе витрина умрёт молча.
 */
export const enabledModels = async () => {
  const raw = await getSetting('models_enabled')
  const list = String(raw || '').split(',').map(s => s.trim()).filter(m => ALL_MODELS.includes(m))
  return list.length ? list : [...ALL_MODELS]
}

export const isModelEnabled = async (model) => (await enabledModels()).includes(model)
