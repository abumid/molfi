import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query(`SELECT * FROM sheep WHERE status='active' ORDER BY created_at DESC`)
  ok(res, { sheep: result.rows })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  const sheep = (await pool.query(`SELECT * FROM sheep WHERE id=$1`, [req.params.id])).rows[0]
  if (!sheep) return fail(res, 'Not found', 404)
  const weights = (await pool.query(`SELECT * FROM weight_records WHERE sheep_id=$1 ORDER BY recorded_at DESC LIMIT 10`, [req.params.id])).rows
  const investors = (await pool.query(
    `SELECT s.share_pct, s.purchased_at, u.name FROM shares s JOIN users u ON s.user_id=u.id WHERE s.sheep_id=$1 AND s.status='active'`,
    [req.params.id]
  )).rows
  const acts = (await pool.query(`SELECT * FROM activity WHERE sheep_id=$1 ORDER BY created_at DESC LIMIT 20`, [req.params.id])).rows
  ok(res, { sheep, weights, investors, activity: acts })
}))

// Только админ (или доверенное IoT-устройство фермы) может писать вес —
// раньше эндпоинт был полностью открыт без авторизации.
router.post('/:id/weight', requireAdmin, asyncHandler(async (req, res) => {
  const { weight_g } = req.body
  await pool.query(`INSERT INTO weight_records (sheep_id, weight_g) VALUES ($1, $2)`, [req.params.id, weight_g])
  await pool.query(`UPDATE sheep SET current_weight_g=$1 WHERE id=$2`, [weight_g, req.params.id])
  ok(res, { message: 'Weight recorded' })
}))

export default router
