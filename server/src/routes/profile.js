import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.put('/update', requireAuth, asyncHandler(async (req, res) => {
  const { name } = req.body
  if (!name || !name.trim()) return fail(res, 'Name required')

  const user = (await pool.query(
    `UPDATE users SET name = $1 WHERE id = $2 RETURNING id, phone, name`,
    [name.trim(), req.user.id]
  )).rows[0]
  if (!user) return fail(res, 'User not found', 404)

  ok(res, { user })
}))

export default router
