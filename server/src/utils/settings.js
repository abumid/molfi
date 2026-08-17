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
  platform_fee_bp: '300',
  boarding_fee_monthly_tiyin: '0',
  late_fee_bp: '0',
  min_investment_tiyin: '100000000',
  overdue_grace_days: '5',
  default_after_missed: '3',
}

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

/** Комиссия платформы в базисных пунктах. Самая частая настройка. */
export const platformFeeBp = () => getSettingInt('platform_fee_bp')
