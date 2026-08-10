import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()
const VALID_TYPES = ['feeding', 'weighing', 'vet', 'video']

// GET /api/sheep/:id/activity
router.get('/sheep/:id/activity', asyncHandler(async (req, res) => {
  const sheepId = req.params.id
  const limit = Math.min(parseInt(req.query.limit) || 20, 50)
  const offset = parseInt(req.query.offset) || 0

  const sheep = (await pool.query(`SELECT id FROM sheep WHERE id = $1`, [sheepId])).rows[0]
  if (!sheep) return fail(res, 'Баран не найден', 404)

  const [items, countRow] = await Promise.all([
    pool.query(
      `SELECT id, sheep_id, type, title_ru, title_uz,
              description_ru, description_uz, meta, created_at
       FROM activity WHERE sheep_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [sheepId, limit, offset]
    ),
    pool.query(`SELECT COUNT(*) FROM activity WHERE sheep_id = $1`, [sheepId]),
  ])

  ok(res, {
    data: {
      items: items.rows,
      total: parseInt(countRow.rows[0].count),
      limit,
      offset,
    },
  })
}))

// POST /api/sheep/:id/activity — раньше был полностью открыт без авторизации
router.post('/sheep/:id/activity', requireAdmin, asyncHandler(async (req, res) => {
  const sheepId = req.params.id
  const { type, title_ru, title_uz, description_ru, description_uz, meta } = req.body

  const sheep = (await pool.query(`SELECT id FROM sheep WHERE id = $1`, [sheepId])).rows[0]
  if (!sheep) return fail(res, 'Баран не найден', 404)

  if (!type || !VALID_TYPES.includes(type)) return fail(res, 'Неверный тип события')
  if (!title_ru?.trim()) return fail(res, 'title_ru обязателен')
  if (!title_uz?.trim()) return fail(res, 'title_uz обязателен')

  let safeMeta = null
  if (type === 'weighing') {
    if (!meta || typeof meta.weight_kg !== 'number' || meta.weight_kg <= 0) {
      return fail(res, 'weighing требует meta.weight_kg > 0')
    }
    safeMeta = meta
  } else if (type === 'vet') {
    if (!meta || !['Здоров', 'Лечение'].includes(meta.result_ru)) {
      return fail(res, 'vet требует meta.result_ru = "Здоров" или "Лечение"')
    }
    safeMeta = meta
  } else if (type === 'video') {
    safeMeta = meta || null
  }

  const result = await pool.query(
    `INSERT INTO activity
       (sheep_id, type, title_ru, title_uz, description_ru, description_uz, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      sheepId,
      type,
      title_ru.trim(),
      title_uz.trim(),
      description_ru || null,
      description_uz || null,
      safeMeta ? JSON.stringify(safeMeta) : null,
    ]
  )

  res.status(201).json({ success: true, data: result.rows[0] })
}))

// PUT /api/activity/:id — раньше был полностью открыт без авторизации
router.put('/activity/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { title_ru, title_uz, description_ru, description_uz, meta } = req.body

  if (!title_ru?.trim()) return fail(res, 'title_ru обязателен')
  if (!title_uz?.trim()) return fail(res, 'title_uz обязателен')

  const existing = (await pool.query(
    `SELECT id FROM activity WHERE id = $1`, [req.params.id]
  )).rows[0]
  if (!existing) return fail(res, 'Событие не найдено', 404)

  const result = await pool.query(
    `UPDATE activity
     SET title_ru = $1, title_uz = $2,
         description_ru = $3, description_uz = $4,
         meta = $5
     WHERE id = $6
     RETURNING *`,
    [
      title_ru.trim(),
      title_uz.trim(),
      description_ru || null,
      description_uz || null,
      meta ? JSON.stringify(meta) : null,
      req.params.id,
    ]
  )

  ok(res, { data: result.rows[0] })
}))

// DELETE /api/activity/:id — раньше был полностью открыт без авторизации
router.delete('/activity/:id', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `DELETE FROM activity WHERE id = $1 RETURNING id`,
    [req.params.id]
  )
  if (!result.rows[0]) return fail(res, 'Событие не найдено', 404)
  ok(res, { data: { deleted_id: result.rows[0].id } })
}))

export default router
