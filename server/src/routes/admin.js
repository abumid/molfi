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

router.get('/sheep', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query(`SELECT * FROM sheep ORDER BY created_at DESC`)
  ok(res, { sheep: result.rows })
}))

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

router.post('/sheep', requireAdmin, asyncHandler(async (req, res) => {
  const { name, breed, birth_date, current_weight_g, price_tiyin, rfid_tag, description, farm_id, price_per_kg_tiyin, total_shares } = req.body
  const result = await pool.query(
    `INSERT INTO sheep (farm_id, name, breed, birth_date, current_weight_g, price_tiyin, rfid_tag, description, price_per_kg_tiyin, total_shares)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [farm_id || 1, name, breed, birth_date, current_weight_g, price_tiyin, rfid_tag, description, price_per_kg_tiyin || 4500000, total_shares || 100]
  )
  ok(res, { sheep: result.rows[0] })
}))

// POST /sheep/:id/sell удалён в v2: раздавал выплаты по долям через
// calcFinalPayout, которого в новых расчётах нет. Продажа животного
// переезжает в contracts (ownership) на этапе 3.

router.post('/sheep/:id/unsell', requireAdmin, asyncHandler(async (req, res) => {
  const sheep = (await pool.query(
    `SELECT * FROM sheep WHERE id = $1 AND status = 'sold'`,
    [req.params.id]
  )).rows[0]
  if (!sheep) return res.status(404).json({ error: 'not_found', message: 'Баран не найден или не продан' })

  const paidShares = (await pool.query(
    `SELECT s.*, wb.balance_tiyin as user_balance, u.phone as user_phone
     FROM shares s
     LEFT JOIN wallet_balances wb ON wb.user_id = s.user_id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.sheep_id = $1 AND s.status = 'paid'`,
    [req.params.id]
  )).rows

  const payoutByUser = {}
  for (const share of paidShares) {
    const tx = (await pool.query(
      `SELECT COALESCE(SUM(amount_tiyin), 0)::bigint as total
       FROM transactions
       WHERE user_id = $1 AND type = 'payout' AND description LIKE '%' || $2 || '%'`,
      [share.user_id, sheep.name]
    )).rows[0]
    payoutByUser[share.user_id] = Number(tx.total)
  }

  const insufficientUsers = []
  for (const share of paidShares) {
    const payoutAmount = payoutByUser[share.user_id] || 0
    const balance = Number(share.user_balance || 0)
    if (balance < payoutAmount) {
      insufficientUsers.push({
        user_id: share.user_id,
        phone: share.user_phone,
        deficit_tiyin: payoutAmount - balance
      })
    }
  }

  if (insufficientUsers.length > 0) {
    return res.status(400).json({
      error: 'insufficient_balance',
      message: 'У некоторых инвесторов недостаточно баланса',
      users: insufficientUsers
    })
  }

  const client = await pool.connect()
  let reversed_count = 0
  try {
    await client.query('BEGIN')

    await client.query(
      `UPDATE sheep SET status = 'active', final_weight_g = NULL, final_sale_price_tiyin = NULL, sold_at = NULL WHERE id = $1`,
      [req.params.id]
    )

    for (const share of paidShares) {
      const payoutAmount = payoutByUser[share.user_id] || 0
      await client.query(
        `UPDATE wallet_balances SET balance_tiyin = balance_tiyin - $1 WHERE user_id = $2`,
        [payoutAmount, share.user_id]
      )
      await client.query(`UPDATE shares SET status = 'active' WHERE id = $1`, [share.id])
      await client.query(
        `DELETE FROM transactions WHERE user_id = $1 AND type = 'payout' AND description LIKE '%' || $2 || '%'`,
        [share.user_id, sheep.name]
      )
      reversed_count++
    }

    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  ok(res, { reversed_count })
}))

router.delete('/sheep/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int as cnt FROM shares WHERE sheep_id = $1 AND status = 'active'`,
    [req.params.id]
  )
  if (rows[0].cnt > 0) {
    return res.status(400).json({
      error: 'has_active_shares',
      message: 'Нельзя удалить барана с активными долями'
    })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM shares WHERE sheep_id = $1`, [req.params.id])
    await client.query(`DELETE FROM activity WHERE sheep_id = $1`, [req.params.id])
    await client.query(`DELETE FROM videos WHERE sheep_id = $1`, [req.params.id])
    await client.query(`DELETE FROM weight_records WHERE sheep_id = $1`, [req.params.id])
    await client.query(`DELETE FROM sheep WHERE id = $1`, [req.params.id])
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  ok(res, {})
}))

router.put('/sheep/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { name, breed, current_weight_g, price_tiyin, rfid_tag, price_per_kg_tiyin, status } = req.body
  const result = await pool.query(
    `UPDATE sheep SET
       name = COALESCE($1, name),
       breed = COALESCE($2, breed),
       current_weight_g = COALESCE($3, current_weight_g),
       price_tiyin = COALESCE($4, price_tiyin),
       rfid_tag = COALESCE($5, rfid_tag),
       price_per_kg_tiyin = COALESCE($6, price_per_kg_tiyin),
       status = COALESCE($7, status)
     WHERE id = $8
     RETURNING *`,
    [name, breed, current_weight_g, price_tiyin, rfid_tag, price_per_kg_tiyin, status, req.params.id]
  )
  ok(res, { sheep: result.rows[0] })
}))

export default router
