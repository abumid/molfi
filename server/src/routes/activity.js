import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()
const VALID_TYPES = ['feeding', 'weighing', 'vet', 'video']
const VET_RESULTS = ['healthy', 'treatment']

// Заголовок обязателен хотя бы на одном языке. Раньше требовались
// одновременно ru и uz, из-за чего событие нельзя было завести
// на английском — а он теперь язык по умолчанию.
const hasAnyTitle = (b) => [b.title_en, b.title_ru, b.title_uz].some(v => v?.trim())

router.get('/animals/:id/activity', asyncHandler(async (req, res) => {
  const animalId = req.params.id
  const limit = Math.min(parseInt(req.query.limit) || 20, 50)
  const offset = parseInt(req.query.offset) || 0

  const animal = (await pool.query(`SELECT id FROM animals WHERE id = $1`, [animalId])).rows[0]
  if (!animal) return fail(res, 'animal_not_found', 404)

  const [items, countRow] = await Promise.all([
    pool.query(
      `SELECT id, animal_id, type, title_en, title_ru, title_uz,
              description_en, description_ru, description_uz, meta, created_at
       FROM activity WHERE animal_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [animalId, limit, offset]
    ),
    pool.query(`SELECT COUNT(*) FROM activity WHERE animal_id = $1`, [animalId]),
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

router.post('/animals/:id/activity', requireAdmin, asyncHandler(async (req, res) => {
  const animalId = req.params.id
  const b = req.body
  const { type, meta } = b

  const animal = (await pool.query(`SELECT id FROM animals WHERE id = $1`, [animalId])).rows[0]
  if (!animal) return fail(res, 'animal_not_found', 404)

  if (!type || !VALID_TYPES.includes(type)) return fail(res, 'invalid_activity_type')
  if (!hasAnyTitle(b)) return fail(res, 'title required in at least one language')

  let safeMeta = null
  if (type === 'weighing') {
    if (!meta || typeof meta.weight_kg !== 'number' || meta.weight_kg <= 0) {
      return fail(res, 'weighing requires meta.weight_kg > 0')
    }
    safeMeta = meta
  } else if (type === 'vet') {
    if (!meta || !VET_RESULTS.includes(meta.result)) {
      return fail(res, `vet requires meta.result to be one of: ${VET_RESULTS.join(', ')}`)
    }
    safeMeta = meta
  } else if (type === 'video') {
    safeMeta = meta || null
  }

  const result = await pool.query(
    `INSERT INTO activity
       (animal_id, type, title_en, title_ru, title_uz,
        description_en, description_ru, description_uz, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      animalId, type,
      b.title_en?.trim() || null, b.title_ru?.trim() || null, b.title_uz?.trim() || null,
      b.description_en || null, b.description_ru || null, b.description_uz || null,
      safeMeta ? JSON.stringify(safeMeta) : null,
    ]
  )

  // Взвешивание — не только запись в ленту: текущий вес животного
  // и история весов должны обновиться, иначе график расходится с лентой
  if (type === 'weighing') {
    const grams = Math.round(meta.weight_kg * 1000)
    await pool.query(`UPDATE animals SET current_weight_g = $1 WHERE id = $2`, [grams, animalId])
    await pool.query(`INSERT INTO weight_records (animal_id, weight_g) VALUES ($1,$2)`, [animalId, grams])
  }

  res.status(201).json({ success: true, data: result.rows[0] })
}))

router.put('/activity/:id', requireAdmin, asyncHandler(async (req, res) => {
  const b = req.body
  if (!hasAnyTitle(b)) return fail(res, 'title required in at least one language')

  const existing = (await pool.query(
    `SELECT id FROM activity WHERE id = $1`, [req.params.id]
  )).rows[0]
  if (!existing) return fail(res, 'not_found', 404)

  const result = await pool.query(
    `UPDATE activity
     SET title_en = $1, title_ru = $2, title_uz = $3,
         description_en = $4, description_ru = $5, description_uz = $6,
         meta = $7
     WHERE id = $8
     RETURNING *`,
    [
      b.title_en?.trim() || null, b.title_ru?.trim() || null, b.title_uz?.trim() || null,
      b.description_en || null, b.description_ru || null, b.description_uz || null,
      b.meta ? JSON.stringify(b.meta) : null,
      req.params.id,
    ]
  )

  ok(res, { data: result.rows[0] })
}))

router.delete('/activity/:id', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `DELETE FROM activity WHERE id = $1 RETURNING id`,
    [req.params.id]
  )
  if (!result.rows[0]) return fail(res, 'not_found', 404)
  ok(res, { data: { deleted_id: result.rows[0].id } })
}))

export default router
