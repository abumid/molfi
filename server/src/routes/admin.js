import { Router } from 'express'
import bcrypt from 'bcrypt'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()

// Transaction types that increase the user balance (income).
// 'topup' used to be missing from this list in two places below, which made
// editing or deleting a top-up through the admin panel move the balance in the
// opposite direction.
const INCOME_TYPES = ['deposit', 'payout', 'topup']


router.get('/users', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT u.id, u.phone, u.name, u.role, u.created_at,
      COALESCE(w.balance_tiyin, 0) as balance_tiyin,
      COUNT(c.id)::int as contracts_count
    FROM users u
    LEFT JOIN wallet_balances w ON w.user_id = u.id
    LEFT JOIN contracts c ON c.user_id = u.id AND c.status IN ('pending','active')
    GROUP BY u.id, w.balance_tiyin
    ORDER BY u.id DESC
  `)
  ok(res, { users: result.rows })
}))

router.put('/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, phone, password, balance_tiyin, role } = req.body

  // Update the user record
  await pool.query(`
    UPDATE users SET
      name = COALESCE($1, name),
      phone = COALESCE($2, phone),
      role = COALESCE($3, role)
    WHERE id = $4
  `, [name || null, phone || null, role || null, id])

  // Update the password if one was sent.
  // The minimum is the same as at sign-up (routes/auth.js): otherwise the admin
  // panel could set a one-character password, and the requirement on the client
  // would mean nothing.
  if (password && password.trim()) {
    if (password.trim().length < 6) return fail(res, 'Password must be at least 6 characters')
    const hash = await bcrypt.hash(password.trim(), 10)
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hash, id]
    )
  }

  // Update the balance if one was sent
  if (balance_tiyin !== undefined && balance_tiyin !== null) {
    const balNum = Number(balance_tiyin)

    // Read the current balance
    const cur = await pool.query(
      'SELECT COALESCE(balance_tiyin, 0) as balance_tiyin FROM wallet_balances WHERE user_id = $1',
      [id]
    )
    const currentBal = Number(cur.rows[0]?.balance_tiyin || 0)
    const diff = balNum - currentBal

    console.log(`Balance update: user=${id}, current=${currentBal}, new=${balNum}, diff=${diff}`)

    // Update the balance
    await pool.query(`
      INSERT INTO wallet_balances (user_id, balance_tiyin)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET balance_tiyin = $2
    `, [id, balNum])

    // Create a transaction if there is a difference
    if (diff !== 0) {
      const txType = diff > 0 ? 'deposit' : 'withdrawal'
      const txDesc = diff > 0
        ? 'Added by admin'
        : 'Deducted by admin'

      await pool.query(`
        INSERT INTO transactions (user_id, type, amount_tiyin, description)
        VALUES ($1, $2, $3, $4)
      `, [id, txType, Math.abs(diff), txDesc])

      console.log(`Transaction created: type=${txType}, amount=${Math.abs(diff)}`)
    }
  }

  ok(res, {})
}))



router.put('/users/:id/balance', requireAdmin, asyncHandler(async (req, res) => {
  const { balance_tiyin } = req.body
  const userId = req.params.id

  const current = await pool.query(
    'SELECT balance_tiyin FROM wallet_balances WHERE user_id = $1',
    [userId]
  )
  const currentBalance = Number(current.rows[0]?.balance_tiyin || 0)
  const diff = Number(balance_tiyin) - currentBalance

  await pool.query(`
    INSERT INTO wallet_balances (user_id, balance_tiyin)
    VALUES ($1, $2)
    ON CONFLICT (user_id)
    DO UPDATE SET balance_tiyin = $2
  `, [userId, balance_tiyin])

  if (diff !== 0) {
    await pool.query(`
      INSERT INTO transactions
        (user_id, type, amount_tiyin, description)
      VALUES ($1, $2, $3, $4)
    `, [
      userId,
      diff > 0 ? 'deposit' : 'withdrawal',
      Math.abs(diff),
      diff > 0
        ? 'Added by admin'
        : 'Deducted by admin'
    ])
  }

  ok(res, {})
}))


router.get('/transactions', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT t.*, u.phone as user_phone
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    ORDER BY t.id DESC
  `)
  ok(res, { transactions: result.rows })
}))

router.put('/transactions/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { description, type, amount_tiyin } = req.body
  const { rows } = await pool.query(`SELECT * FROM transactions WHERE id = $1`, [req.params.id])
  const tx = rows[0]
  if (!tx) return res.status(404).json({ error: 'not_found' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (amount_tiyin !== undefined) {
      const oldAmt = Number(tx.amount_tiyin)
      const newAmt = Number(amount_tiyin)
      const oldIsIncome = INCOME_TYPES.includes(tx.type)
      const newType = type || tx.type
      const newIsIncome = INCOME_TYPES.includes(newType)

      const oldEffect = oldIsIncome ? oldAmt : -oldAmt
      const newEffect = newIsIncome ? newAmt : -newAmt
      const balanceDiff = newEffect - oldEffect

      if (balanceDiff !== 0) {
        await client.query(
          `UPDATE wallet_balances SET balance_tiyin = balance_tiyin + $1 WHERE user_id = $2`,
          [balanceDiff, tx.user_id]
        )
      }
    }

    await client.query(
      `UPDATE transactions SET
         description = COALESCE($1, description),
         type        = COALESCE($2, type),
         amount_tiyin = COALESCE($3, amount_tiyin)
       WHERE id = $4`,
      [description ?? null, type ?? null, amount_tiyin ?? null, req.params.id]
    )

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  ok(res, {})
}))

router.delete('/transactions/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*, wb.balance_tiyin as user_balance
    FROM transactions t
    LEFT JOIN wallet_balances wb ON wb.user_id = t.user_id
    WHERE t.id = $1
  `, [req.params.id])

  const tx = rows[0]
  if (!tx) return res.status(404).json({ error: 'not_found' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (INCOME_TYPES.includes(tx.type)) {
      await client.query(
        `UPDATE wallet_balances SET balance_tiyin = balance_tiyin - $1 WHERE user_id = $2`,
        [tx.amount_tiyin, tx.user_id]
      )
    } else {
      await client.query(
        `UPDATE wallet_balances SET balance_tiyin = balance_tiyin + $1 WHERE user_id = $2`,
        [tx.amount_tiyin, tx.user_id]
      )
    }

    await client.query(`DELETE FROM transactions WHERE id = $1`, [req.params.id])
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  ok(res, {})
}))


// All animal endpoints moved to routes/animals.js:
//   /admin/sheep        -> /admin/animals
//   /admin/sheep/:id/sell -> /admin/animals/:id/sell (payout to the owner, not to shareholders)
// /admin/sheep/:id/unsell was removed: it rolled back share payouts that no longer exist.




// One user's contracts — for the card in the list
router.get('/users/:id/contracts', requireAdmin, asyncHandler(async (req, res) => {
  const contracts = (await pool.query(`
    SELECT c.*, p.title_en, p.title_ru, p.title_uz,
           a.name AS animal_name, a.species AS animal_species,
           (SELECT count(*)::int FROM payment_schedule s WHERE s.contract_id = c.id) AS payments_total,
           (SELECT count(*)::int FROM payment_schedule s WHERE s.contract_id = c.id AND s.status = 'paid') AS payments_paid
    FROM contracts c
    JOIN products p ON p.id = c.product_id
    LEFT JOIN animals a ON a.id = c.animal_id
    WHERE c.user_id = $1
    ORDER BY c.created_at DESC
  `, [req.params.id])).rows
  ok(res, { contracts })
}))

// Dashboard summary in a single query: six separate calls from the front end
// would mean six round-trips on every page open
router.get('/stats', requireAdmin, asyncHandler(async (req, res) => {
  const [animals, users, contracts, byModel, payments, dueThisMonth] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE status='active')::int AS available
                FROM animals`),
    pool.query(`SELECT count(*)::int AS total FROM users`),
    pool.query(`SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE status='active')::int AS active
                FROM contracts`),
    pool.query(`SELECT model_type, count(*)::int AS n
                FROM contracts WHERE status='active' GROUP BY model_type`),
    pool.query(`SELECT count(*) FILTER (WHERE status='overdue')::int AS overdue,
                       count(*) FILTER (WHERE status='pending')::int AS pending
                FROM payment_schedule`),
    pool.query(`SELECT COALESCE(sum(amount_tiyin),0)::bigint AS s
                FROM payment_schedule
                WHERE status IN ('pending','overdue')
                  AND due_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`),
  ])

  ok(res, {
    stats: {
      animals: animals.rows[0],
      users: users.rows[0],
      contracts: contracts.rows[0],
      by_model: Object.fromEntries(byModel.rows.map(r => [r.model_type, r.n])),
      payments: payments.rows[0],
      due_this_month_tiyin: Number(dueThisMonth.rows[0].s),
    },
  })
}))

// Creating a user by hand. Needed when the client came in offline: a contract
// cannot be made out to them until an account exists.
router.post('/users', requireAdmin, asyncHandler(async (req, res) => {
  const { phone, name, password, role, balance_tiyin } = req.body
  if (!phone?.trim()) return fail(res, 'phone required')

  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 9) return fail(res, 'phone looks invalid')
  const normalized = '+' + digits

  const exists = (await pool.query(
    `SELECT id FROM users WHERE phone = ANY($1)`, [[normalized, digits]]
  )).rows[0]
  if (exists) return fail(res, 'user_already_exists')

  if (password && password.trim().length < 6)
    return fail(res, 'Password must be at least 6 characters')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const hash = password?.trim() ? await bcrypt.hash(password.trim(), 10) : null
    const ref = 'REF' + Math.random().toString(36).slice(2, 8).toUpperCase()

    const user = (await client.query(
      `INSERT INTO users (phone, name, password_hash, role, referral_code)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, phone, name, role, created_at`,
      [normalized, name?.trim() || null, hash, role === 'admin' ? 'admin' : 'user', ref]
    )).rows[0]

    // A wallet is always created: without a row in wallet_balances the charge
    // at contract checkout runs into a missing record
    const initial = Number(balance_tiyin) || 0
    await client.query(
      `INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1,$2)`,
      [user.id, initial]
    )
    if (initial > 0) {
      await client.query(
        `INSERT INTO transactions (user_id, type, amount_tiyin, description)
         VALUES ($1,'deposit',$2,'Opening balance set by admin')`,
        [user.id, initial]
      )
    }

    await client.query('COMMIT')
    ok(res, { user })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

router.delete('/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  // A user with a live contract is not deleted — there is money behind them
  const active = (await pool.query(
    `SELECT count(*)::int AS n FROM contracts
     WHERE user_id = $1 AND status IN ('pending','active')`,
    [req.params.id]
  )).rows[0].n
  if (active > 0) return fail(res, 'has_active_contracts')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM transactions WHERE user_id = $1`, [req.params.id])
    await client.query(`DELETE FROM contracts WHERE user_id = $1`, [req.params.id])
    await client.query(`DELETE FROM wallet_balances WHERE user_id = $1`, [req.params.id])
    const gone = (await client.query(
      `DELETE FROM users WHERE id = $1 RETURNING id`, [req.params.id]
    )).rows[0]
    if (!gone) { await client.query('ROLLBACK'); return fail(res, 'not_found', 404) }
    await client.query('COMMIT')
    ok(res, { deleted: gone.id })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

// A manual transaction. The balance moves by the same rule as when editing an
// existing one: types in INCOME_TYPES increase it, the rest decrease it.
// Otherwise the history and the wallet drift apart.
router.post('/transactions', requireAdmin, asyncHandler(async (req, res) => {
  const { user_id, type, amount_tiyin, description, contract_id } = req.body
  if (!user_id) return fail(res, 'user_id required')
  if (!type?.trim()) return fail(res, 'type required')

  const amount = Math.abs(Number(amount_tiyin))
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 'amount_tiyin must be a positive number')

  const user = (await pool.query(`SELECT id FROM users WHERE id = $1`, [user_id])).rows[0]
  if (!user) return fail(res, 'user_not_found', 404)

  const isIncome = INCOME_TYPES.includes(type)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1,0)
       ON CONFLICT (user_id) DO NOTHING`,
      [user_id]
    )
    await client.query(
      `UPDATE wallet_balances
       SET balance_tiyin = balance_tiyin + $1, updated_at = NOW()
       WHERE user_id = $2`,
      [isIncome ? amount : -amount, user_id]
    )

    const tx = (await client.query(
      `INSERT INTO transactions (user_id, contract_id, type, amount_tiyin, description)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [user_id, contract_id || null, type, isIncome ? amount : -amount,
       description?.trim() || 'Added by admin']
    )).rows[0]

    await client.query('COMMIT')
    ok(res, { transaction: tx, balance_effect: isIncome ? amount : -amount })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

export default router
