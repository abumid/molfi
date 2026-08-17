import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAuth } from '../middleware/auth.js'
import { sendSms } from '../utils/sms.js'
import { sendVerificationCode, sendWelcome } from '../services/telegramBot.js'

const router = Router()
const CODE_TTL_MS = 10 * 60 * 1000

const generateCode = () => String(Math.floor(1000 + Math.random() * 9000))

// В БД номер может лежать и с плюсом, и без — бот сохраняет по-разному
const phoneVariants = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  return ['+' + digits, digits]
}

const findUserByPhone = async (phone, columns = '*') => {
  const rows = (await pool.query(
    `SELECT ${columns} FROM users WHERE phone = ANY($1) LIMIT 1`,
    [phoneVariants(phone)]
  )).rows
  return rows[0] || null
}

const issueSmsCode = async (phone, telegramId) => {
  const code = generateCode()
  const expires = new Date(Date.now() + CODE_TTL_MS)
  await pool.query(`DELETE FROM sms_codes WHERE phone=$1`, [phone])
  await pool.query(`INSERT INTO sms_codes (phone, code, expires_at) VALUES ($1, $2, $3)`, [phone, code, expires])

  let resolvedTelegramId = telegramId || null
  if (!resolvedTelegramId) {
    const row = await findUserByPhone(phone, 'telegram_id')
    resolvedTelegramId = row?.telegram_id || null
  }

  let sentVia = 'none'
  if (resolvedTelegramId) {
    const sent = await sendVerificationCode(resolvedTelegramId, code)
    if (sent) sentVia = 'telegram'
  }
  if (sentVia !== 'telegram' && process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD) {
    await sendSms(phone, `Ваш код подтверждения Molfi: ${code}`)
    sentVia = 'sms'
  }
  if (sentVia === 'none' && process.env.NODE_ENV === 'development') sentVia = 'dev'

  console.log(`[auth] code for ${phone} -> tg:${resolvedTelegramId || '-'} via:${sentVia}`)
  return { code, sentVia }
}

const findValidCode = (phone, code) => pool.query(
  `SELECT * FROM sms_codes WHERE phone=$1 AND code=$2 AND used=false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
  [phone, code]
)

const issueToken = (user) => jwt.sign({ id: user.id, phone: user.phone, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' })

router.post('/check-phone', asyncHandler(async (req, res) => {
  const { phone } = req.body
  if (!phone) return fail(res, 'Phone required')
  const user = await findUserByPhone(phone, 'id, name, password_hash, telegram_id')
  // Строка без пароля создана ботом (пользователь поделился номером) —
  // это ещё не регистрация, ведём его по флоу регистрации
  if (user?.password_hash) return ok(res, { exists: true, name: user.name })
  ok(res, { exists: false, pending: !!user, has_telegram: !!user?.telegram_id })
}))

router.post('/send-sms', asyncHandler(async (req, res) => {
  const { phone, telegram_id } = req.body
  if (!phone) return fail(res, 'Phone required')
  const { code, sentVia } = await issueSmsCode(phone, telegram_id)
  ok(res, { sentVia, ...(process.env.NODE_ENV === 'development' ? { code } : {}) })
}))

router.post('/verify-sms', asyncHandler(async (req, res) => {
  const { phone, code } = req.body
  if (!phone || !code) return fail(res, 'Phone and code required')
  const row = (await findValidCode(phone, code)).rows[0]
  if (row) return ok(res, { valid: true })
  const expired = (await pool.query(
    `SELECT id FROM sms_codes WHERE phone=$1 AND code=$2 AND used=false ORDER BY created_at DESC LIMIT 1`,
    [phone, code]
  )).rows[0]
  ok(res, { valid: false, error: expired ? 'expired' : 'invalid' })
}))

router.post('/register', asyncHandler(async (req, res) => {
  const { phone, code, password, name, telegram_id, telegram_username, first_name, last_name } = req.body
  if (!phone || !code || !password) return fail(res, 'Phone, code and password required')
  if (password.length < 6) return fail(res, 'Password must be at least 6 characters')

  const codeRow = (await findValidCode(phone, code)).rows[0]
  if (!codeRow) return fail(res, 'Invalid or expired code')

  const existing = await findUserByPhone(phone, 'id, password_hash')
  if (existing?.password_hash) return fail(res, 'User already exists')

  await pool.query(`UPDATE sms_codes SET used=true WHERE id=$1`, [codeRow.id])
  const hash = await bcrypt.hash(password, 10)
  const ref = 'REF' + Math.random().toString(36).slice(2, 8).toUpperCase()

  const user = existing
    ? (await pool.query(
        `UPDATE users SET name=COALESCE($2, name), password_hash=$3,
           referral_code=COALESCE(referral_code, $4),
           telegram_id=COALESCE($5, telegram_id),
           telegram_username=COALESCE($6, telegram_username),
           first_name=COALESCE($7, first_name),
           last_name=COALESCE($8, last_name)
         WHERE id=$1 RETURNING *`,
        [existing.id, name || null, hash, ref, telegram_id || null, telegram_username || null, first_name || null, last_name || null]
      )).rows[0]
    : (await pool.query(
        `INSERT INTO users (phone, name, password_hash, referral_code, telegram_id, telegram_username, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [phone, name || null, hash, ref, telegram_id || null, telegram_username || null, first_name || null, last_name || null]
      )).rows[0]

  await pool.query(
    `INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING`,
    [user.id]
  )

  if (telegram_id) {
    await sendWelcome(telegram_id, name || first_name || 'друг')
  }

  ok(res, { token: issueToken(user), user: { id: user.id, phone: user.phone, name: user.name, role: user.role } })
}))

router.post('/login', asyncHandler(async (req, res) => {
  const { phone, password } = req.body
  if (!phone || !password) return fail(res, 'Phone and password required')
  const user = await findUserByPhone(phone)
  if (!user || !user.password_hash) return fail(res, 'Invalid credentials', 401)
  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return fail(res, 'Invalid credentials', 401)

  ok(res, { token: issueToken(user), user: { id: user.id, phone: user.phone, name: user.name, role: user.role } })
}))

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { phone } = req.body
  if (!phone) return fail(res, 'Phone required')
  const user = await findUserByPhone(phone, 'id')
  if (!user) return fail(res, 'User not found', 404)
  const { code } = await issueSmsCode(phone)
  ok(res, process.env.NODE_ENV === 'development' ? { code } : {})
}))

router.post('/telegram-login', asyncHandler(async (req, res) => {
  const { initData } = req.body
  if (!initData) return fail(res, 'initData required')

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest()
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  if (computedHash !== hash) return fail(res, 'Invalid Telegram signature', 401)

  const userJson = params.get('user')
  if (!userJson) return fail(res, 'User data missing')
  const tgUser = JSON.parse(userJson)
  console.log('[telegram-login] parsed tgUser:', tgUser, '| tgUser.id:', tgUser.id, '(type:', typeof tgUser.id, ')')

  const existing = (await pool.query(`SELECT * FROM users WHERE telegram_id=$1`, [tgUser.id])).rows[0]
  if (existing) {
    return ok(res, {
      exists: true,
      token: issueToken(existing),
      user: { id: existing.id, phone: existing.phone, name: existing.name, role: existing.role },
    })
  }

  ok(res, {
    exists: false,
    telegram_id: tgUser.id,
    telegram_username: tgUser.username || null,
    first_name: tgUser.first_name || null,
    last_name: tgUser.last_name || null,
  })
}))

router.post('/reset-password', asyncHandler(async (req, res) => {
  const { phone, code, newPassword } = req.body
  if (!phone || !code || !newPassword) return fail(res, 'Phone, code and new password required')
  if (newPassword.length < 6) return fail(res, 'Password must be at least 6 characters')

  const codeRow = (await findValidCode(phone, code)).rows[0]
  if (!codeRow) return fail(res, 'Invalid or expired code')

  await pool.query(`UPDATE sms_codes SET used=true WHERE id=$1`, [codeRow.id])
  const hash = await bcrypt.hash(newPassword, 10)
  const result = await pool.query(`UPDATE users SET password_hash=$1 WHERE phone = ANY($2)`, [hash, phoneVariants(phone)])
  if (!result.rowCount) return fail(res, 'User not found', 404)

  ok(res, {})
}))

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  // Баланс берём из wallet_balances — это единственная таблица, в которую
  // реально пишут пополнения и списания. users.balance не обновлял никто,
  // и профиль показывал ноль всем подряд.
  const user = (await pool.query(
    `SELECT u.id, u.phone, u.name, u.role, u.language,
            COALESCE(w.balance_tiyin, 0) AS balance
     FROM users u
     LEFT JOIN wallet_balances w ON w.user_id = u.id
     WHERE u.id = $1`,
    [req.user.id]
  )).rows[0]
  if (!user) return fail(res, 'User not found', 404)
  ok(res, { user })
}))

export default router
