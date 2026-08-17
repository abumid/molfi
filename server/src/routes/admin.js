import { Router } from 'express'
import bcrypt from 'bcrypt'
import { pool } from '../db/pool.js'
import { ok, asyncHandler } from '../utils/response.js'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()

// Типы транзакций, которые увеличивают баланс пользователя (доход).
// Раньше 'topup' не входил в этот список в двух местах ниже, из-за чего
// редактирование/удаление пополнения через админку сдвигало баланс в
// обратную сторону.
const INCOME_TYPES = ['deposit', 'payout', 'topup']


router.get('/users', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT u.id, u.phone, u.name, u.role, u.created_at,
      COALESCE(w.balance_tiyin, 0) as balance_tiyin,
      COUNT(s.id)::int as shares_count
    FROM users u
    LEFT JOIN wallet_balances w ON w.user_id = u.id
    LEFT JOIN shares s ON s.user_id = u.id
    GROUP BY u.id, w.balance_tiyin
    ORDER BY u.id DESC
  `)
  ok(res, { users: result.rows })
}))

router.put('/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, phone, password, balance_tiyin, role } = req.body

  // Обновить данные юзера
  await pool.query(`
    UPDATE users SET
      name = COALESCE($1, name),
      phone = COALESCE($2, phone),
      role = COALESCE($3, role)
    WHERE id = $4
  `, [name || null, phone || null, role || null, id])

  // Обновить пароль если передан
  if (password && password.trim()) {
    const bcrypt = (await import('bcrypt')).default
    const hash = await bcrypt.hash(password, 10)
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hash, id]
    )
  }

  // Обновить баланс если передан
  if (balance_tiyin !== undefined && balance_tiyin !== null) {
    const balNum = Number(balance_tiyin)

    // Получить текущий баланс
    const cur = await pool.query(
      'SELECT COALESCE(balance_tiyin, 0) as balance_tiyin FROM wallet_balances WHERE user_id = $1',
      [id]
    )
    const currentBal = Number(cur.rows[0]?.balance_tiyin || 0)
    const diff = balNum - currentBal

    console.log(`Balance update: user=${id}, current=${currentBal}, new=${balNum}, diff=${diff}`)

    // Обновить баланс
    await pool.query(`
      INSERT INTO wallet_balances (user_id, balance_tiyin)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET balance_tiyin = $2
    `, [id, balNum])

    // Создать транзакцию если есть разница
    if (diff !== 0) {
      const txType = diff > 0 ? 'deposit' : 'withdrawal'
      const txDesc = diff > 0
        ? 'Пополнение администратором'
        : 'Списание администратором'

      await pool.query(`
        INSERT INTO transactions (user_id, type, amount_tiyin, description)
        VALUES ($1, $2, $3, $4)
      `, [id, txType, Math.abs(diff), txDesc])

      console.log(`Transaction created: type=${txType}, amount=${Math.abs(diff)}`)
    }
  }

  ok(res, {})
}))

router.get('/users/:id/shares', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT s.*, sh.name as sheep_name
    FROM shares s
    LEFT JOIN sheep sh ON sh.id = s.sheep_id
    WHERE s.user_id = $1
    ORDER BY s.id DESC
  `, [req.params.id])
  ok(res, { shares: result.rows })
}))

router.delete('/shares/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT sheep_id, share_pct, purchase_price_tiyin, user_id FROM shares WHERE id = $1`,
    [req.params.id]
  )
  const share = rows[0]
  if (!share) return ok(res, {})

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM shares WHERE id = $1`, [req.params.id])
    await client.query(
      `UPDATE wallet_balances SET balance_tiyin = balance_tiyin + $1 WHERE user_id = $2`,
      [share.purchase_price_tiyin, share.user_id]
    )
    await client.query(
      `UPDATE sheep SET sold_shares = sold_shares - $1 WHERE id = $2`,
      [share.share_pct, share.sheep_id]
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
        ? 'Пополнение администратором'
        : 'Списание администратором'
    ])
  }

  ok(res, {})
}))

router.get('/shares', requireAdmin, asyncHandler(async (req, res) => {
  // shares не хранит фактическую выплату — она есть только в transactions
  // (type='payout'). Раньше страница обращалась к несуществующей колонке
  // s.payout_tiyin и всегда показывала 0 для проданных долей.
  const result = await pool.query(`
    SELECT s.*, sh.name as sheep_name, u.phone as user_phone,
      CASE WHEN s.status = 'paid' THEN (
        SELECT COALESCE(SUM(t.amount_tiyin), 0)
        FROM transactions t
        WHERE t.user_id = s.user_id AND t.type = 'payout' AND t.description LIKE '%' || sh.name || '%'
      ) ELSE NULL END AS payout_tiyin
    FROM shares s
    LEFT JOIN sheep sh ON sh.id = s.sheep_id
    LEFT JOIN users u ON u.id = s.user_id
    ORDER BY s.id DESC
  `)
  ok(res, { shares: result.rows })
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


// Все ручки по животным переехали в routes/animals.js:
//   /admin/sheep        -> /admin/animals
//   /admin/sheep/:id/sell -> /admin/animals/:id/sell (выплата владельцу, не дольщикам)
// /admin/sheep/:id/unsell удалён: откатывал выплаты по долям, которых больше нет.




export default router
