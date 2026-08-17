import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, asyncHandler } from '../utils/response.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/balance', requireAuth, asyncHandler(async (req, res) => {
  const result = (await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [req.user.id])).rows[0]
  ok(res, { balance: result?.balance_tiyin || 0 })
}))

router.post('/topup', requireAuth, asyncHandler(async (req, res) => {
  const { amount_sum } = req.body
  const tiyin = amount_sum * 100
  await pool.query(`INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET balance_tiyin=wallet_balances.balance_tiyin+$2`, [req.user.id, tiyin])
  await pool.query(`INSERT INTO transactions (user_id, type, amount_tiyin, description) VALUES ($1,'topup',$2,'Wallet top-up')`, [req.user.id, tiyin])
  ok(res, { message: 'Balance topped up' })
}))

router.get('/transactions', requireAuth, asyncHandler(async (req, res) => {
  const result = await pool.query(`SELECT * FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user.id])
  ok(res, { transactions: result.rows })
}))

export default router
