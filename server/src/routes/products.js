import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAdmin } from '../middleware/auth.js'
import { ALL_MODELS as MODELS, enabledModels } from '../utils/settings.js'

const router = Router()

// The animal is pulled in with a LEFT JOIN: installment has an empty animal_id
// until shipment, and an INNER join would drop such offers from the list entirely.
const SELECT_PRODUCT = `
  SELECT p.*,
         a.name             AS animal_name,
         a.breed            AS animal_breed,
         a.species          AS animal_species,
         a.current_weight_g AS animal_weight_g,
         a.photo_url        AS animal_photo_url,
         a.status           AS animal_status,
         a.birth_date,
         a.rfid_tag         AS animal_rfid_tag,
         a.price_per_kg_tiyin,
         f.name             AS farm_name,
         f.location         AS farm_location,
         -- The animal camera beats the farm camera: if one is pointed at this
         -- ram, show that one
         COALESCE(a.stream_url, f.stream_url) AS stream_url
  FROM products p
  LEFT JOIN animals a ON a.id = p.animal_id
  LEFT JOIN farms   f ON f.id = p.farm_id
`

// Fields required by each model. In the database this is guarded by
// products_model_fields_check, but catching 23514 and turning it into human
// text costs more than checking upfront.
const validate = (body) => {
  const { model_type, animal_id, price_tiyin, term_months, meat_weight_g } = body
  if (!MODELS.includes(model_type)) return 'model_type must be one of ' + MODELS.join(', ')
  // investment and ownership sell a specific animal at a price
  if (['investment', 'ownership'].includes(model_type)) {
    if (!animal_id) return `${model_type} requires animal_id`
    if (!price_tiyin) return `${model_type} requires price_tiyin`
  }
  // installment sells a promise of meat by a deadline
  if (model_type === 'installment' && (!term_months || !meat_weight_g))
    return 'installment requires term_months and meat_weight_g'
  return null
}

// ── public catalogue ──────────────────────────────────────

// The client needs to know which tabs to draw before requesting the offers
router.get('/models', asyncHandler(async (req, res) => {
  ok(res, { models: await enabledModels() })
}))

router.get('/products', asyncHandler(async (req, res) => {
  const { model } = req.query
  if (model && !MODELS.includes(model)) return fail(res, 'unknown_model')

  // Hidden models must not leak into the catalogue, even if an offer stayed
  // active from earlier times
  const allowed = await enabledModels()
  if (model && !allowed.includes(model)) return ok(res, { products: [] })

  const products = (await pool.query(
    `${SELECT_PRODUCT}
     WHERE p.status = 'active'
       AND p.model_type = ANY($2)
       AND ($1::text IS NULL OR p.model_type = $1)
     ORDER BY p.created_at DESC`,
    [model || null, allowed]
  )).rows

  ok(res, { products })
}))

router.get('/products/:id', asyncHandler(async (req, res) => {
  const product = (await pool.query(`${SELECT_PRODUCT} WHERE p.id = $1`, [req.params.id])).rows[0]
  if (!product) return fail(res, 'not_found', 404)

  // A direct link to an offer of a hidden model must not open either
  if (!(await enabledModels()).includes(product.model_type)) return fail(res, 'not_found', 404)

  // Weight history is only needed where a specific animal is being bought
  const weights = product.animal_id
    ? (await pool.query(
        `SELECT weight_g, recorded_at FROM weight_records
         WHERE animal_id = $1 ORDER BY recorded_at DESC LIMIT 10`,
        [product.animal_id]
      )).rows
    : []

  ok(res, { product, weights })
}))

// ── admin ─────────────────────────────────────────────────

router.get('/admin/products', requireAdmin, asyncHandler(async (req, res) => {
  const { model, status } = req.query
  const products = (await pool.query(
    `${SELECT_PRODUCT}
     WHERE ($1::text IS NULL OR p.model_type = $1)
       AND ($2::text IS NULL OR p.status = $2)
     ORDER BY p.created_at DESC`,
    [model || null, status || null]
  )).rows
  ok(res, { products })
}))

router.post('/admin/products', requireAdmin, asyncHandler(async (req, res) => {
  const err = validate(req.body)
  if (err) return fail(res, err)

  const allowed = await enabledModels()
  if (!allowed.includes(req.body.model_type))
    return fail(res, `model ${req.body.model_type} is disabled (settings.models_enabled)`)

  const {
    model_type, animal_id, farm_id,
    title_en, title_ru, title_uz,
    description_en, description_ru, description_uz, photo_url,
    price_tiyin, term_months, meat_weight_g, boarding_fee_monthly_tiyin,
    slots_total, status, starts_at, ends_at,
  } = req.body

  const product = (await pool.query(
    `INSERT INTO products (
       model_type, animal_id, farm_id,
       title_en, title_ru, title_uz,
       description_en, description_ru, description_uz, photo_url,
       price_tiyin, term_months, meat_weight_g, boarding_fee_monthly_tiyin,
       slots_total, status, starts_at, ends_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      model_type, animal_id || null, farm_id || null,
      title_en || null, title_ru || null, title_uz || null,
      description_en || null, description_ru || null, description_uz || null, photo_url || null,
      price_tiyin || 0, term_months || null, meat_weight_g || null,
      boarding_fee_monthly_tiyin || null,
      // An offer on a specific animal always has exactly one slot: a ram
      // cannot be sold twice, whatever the form says
      ['investment', 'ownership'].includes(model_type) ? 1 : (slots_total || 1),
      status || 'draft', starts_at || null, ends_at || null,
    ]
  )).rows[0]

  ok(res, { product })
}))

router.put('/admin/products/:id', requireAdmin, asyncHandler(async (req, res) => {
  const current = (await pool.query(`SELECT * FROM products WHERE id = $1`, [req.params.id])).rows[0]
  if (!current) return fail(res, 'not_found', 404)

  const merged = { ...current, ...req.body }
  const err = validate(merged)
  if (err) return fail(res, err)

  // slots_total cannot be lowered below what is already sold — the catalogue
  // would show a negative remainder and the contracts would be left hanging.
  if (merged.slots_total < current.slots_taken)
    return fail(res, `slots_total cannot be below slots_taken (${current.slots_taken})`)

  const product = (await pool.query(
    `UPDATE products SET
       model_type=$2, animal_id=$3, farm_id=$4,
       title_en=$5, title_ru=$6, title_uz=$7,
       description_en=$8, description_ru=$9, description_uz=$10, photo_url=$11,
       price_tiyin=$12, term_months=$13, meat_weight_g=$14,
       boarding_fee_monthly_tiyin=$15,
       slots_total=$16, status=$17, starts_at=$18, ends_at=$19
     WHERE id=$1 RETURNING *`,
    [
      req.params.id,
      merged.model_type, merged.animal_id || null, merged.farm_id || null,
      merged.title_en, merged.title_ru, merged.title_uz,
      merged.description_en, merged.description_ru, merged.description_uz, merged.photo_url,
      merged.price_tiyin || 0, merged.term_months, merged.meat_weight_g,
      merged.boarding_fee_monthly_tiyin || null,
      ['investment', 'ownership'].includes(merged.model_type) ? 1 : merged.slots_total,
      merged.status, merged.starts_at, merged.ends_at,
    ]
  )).rows[0]

  ok(res, { product })
}))

router.delete('/admin/products/:id', requireAdmin, asyncHandler(async (req, res) => {
  // An offer with contracts is not deleted: the FK would block it anyway, and
  // the sales history must outlive a catalogue cleanup. Closed instead.
  const used = (await pool.query(
    `SELECT count(*)::int AS n FROM contracts WHERE product_id = $1`,
    [req.params.id]
  )).rows[0].n

  if (used > 0) {
    const product = (await pool.query(
      `UPDATE products SET status='closed' WHERE id=$1 RETURNING *`,
      [req.params.id]
    )).rows[0]
    if (!product) return fail(res, 'not_found', 404)
    return ok(res, { product, closed_instead_of_deleted: true, contracts: used })
  }

  const deleted = (await pool.query(`DELETE FROM products WHERE id=$1 RETURNING id`, [req.params.id])).rows[0]
  if (!deleted) return fail(res, 'not_found', 404)
  ok(res, { deleted: deleted.id })
}))

export default router
