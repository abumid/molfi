import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAdmin } from '../middleware/auth.js'
import { feeRates } from '../utils/settings.js'
import { investmentPayout, boardingDue } from '../utils/calculations.js'

const router = Router()

const SPECIES = ['sheep', 'cattle', 'goat']
const STATUSES = ['active', 'reserved', 'owned', 'sold', 'slaughtered', 'dead']

const SELECT_ANIMAL = `
  SELECT a.*, f.name AS farm_name, f.location AS farm_location
  FROM animals a
  LEFT JOIN farms f ON f.id = a.farm_id
`

// ── публичное ─────────────────────────────────────────────

router.get('/animals', asyncHandler(async (req, res) => {
  const { species } = req.query
  if (species && !SPECIES.includes(species)) return fail(res, 'unknown_species')

  const animals = (await pool.query(
    `${SELECT_ANIMAL}
     WHERE a.status = 'active' AND ($1::text IS NULL OR a.species = $1)
     ORDER BY a.created_at DESC`,
    [species || null]
  )).rows
  ok(res, { animals })
}))

router.get('/animals/:id', asyncHandler(async (req, res) => {
  const animal = (await pool.query(`${SELECT_ANIMAL} WHERE a.id = $1`, [req.params.id])).rows[0]
  if (!animal) return fail(res, 'not_found', 404)

  const [weights, acts, vids] = await Promise.all([
    pool.query(`SELECT * FROM weight_records WHERE animal_id=$1 ORDER BY recorded_at DESC LIMIT 20`, [req.params.id]),
    pool.query(`SELECT * FROM activity WHERE animal_id=$1 ORDER BY created_at DESC LIMIT 20`, [req.params.id]),
    pool.query(`SELECT * FROM videos WHERE animal_id=$1 ORDER BY recorded_at DESC LIMIT 10`, [req.params.id]),
  ])

  ok(res, { animal, weights: weights.rows, activity: acts.rows, videos: vids.rows })
}))

// Писать вес может только админ или доверенное устройство фермы
router.post('/animals/:id/weight', requireAdmin, asyncHandler(async (req, res) => {
  const { weight_g } = req.body
  if (!weight_g) return fail(res, 'weight_g required')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`INSERT INTO weight_records (animal_id, weight_g) VALUES ($1,$2)`, [req.params.id, weight_g])
    const animal = (await client.query(
      `UPDATE animals SET current_weight_g=$1 WHERE id=$2 RETURNING *`,
      [weight_g, req.params.id]
    )).rows[0]
    if (!animal) { await client.query('ROLLBACK'); return fail(res, 'not_found', 404) }
    await client.query('COMMIT')
    ok(res, { animal })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

// ── админ ─────────────────────────────────────────────────

router.get('/admin/animals', requireAdmin, asyncHandler(async (req, res) => {
  const { species, status } = req.query
  const animals = (await pool.query(
    `${SELECT_ANIMAL}
     WHERE ($1::text IS NULL OR a.species = $1)
       AND ($2::text IS NULL OR a.status = $2)
     ORDER BY a.created_at DESC`,
    [species || null, status || null]
  )).rows
  ok(res, { animals })
}))

router.post('/admin/animals', requireAdmin, asyncHandler(async (req, res) => {
  const {
    name, species, breed, sex, birth_date, current_weight_g,
    price_per_kg_tiyin, acquired_cost_tiyin, rfid_tag,
    description, photo_url, farm_id, status, expected_sale_date,
  } = req.body

  if (!name) return fail(res, 'name required')
  if (species && !SPECIES.includes(species)) return fail(res, 'unknown_species')
  if (status && !STATUSES.includes(status)) return fail(res, 'unknown_status')

  const animal = (await pool.query(
    `INSERT INTO animals
       (farm_id, name, species, breed, sex, birth_date, current_weight_g,
        price_per_kg_tiyin, acquired_cost_tiyin, rfid_tag, description, photo_url,
        status, expected_sale_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      farm_id || null, name, species || 'sheep', breed || null, sex || null,
      birth_date || null, current_weight_g || 0,
      price_per_kg_tiyin || null, acquired_cost_tiyin || null, rfid_tag || null,
      description || null, photo_url || null, status || 'active', expected_sale_date || null,
    ]
  )).rows[0]

  // Стартовый вес сразу в историю, иначе график веса начнётся с пустоты
  if (current_weight_g) {
    await pool.query(`INSERT INTO weight_records (animal_id, weight_g) VALUES ($1,$2)`, [animal.id, current_weight_g])
  }

  ok(res, { animal })
}))

router.put('/admin/animals/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { species, status } = req.body
  if (species && !SPECIES.includes(species)) return fail(res, 'unknown_species')
  if (status && !STATUSES.includes(status)) return fail(res, 'unknown_status')

  const b = req.body
  const animal = (await pool.query(
    `UPDATE animals SET
       name               = COALESCE($2, name),
       species            = COALESCE($3, species),
       breed              = COALESCE($4, breed),
       sex                = COALESCE($5, sex),
       birth_date         = COALESCE($6, birth_date),
       current_weight_g   = COALESCE($7, current_weight_g),
       price_per_kg_tiyin = COALESCE($8, price_per_kg_tiyin),
       acquired_cost_tiyin= COALESCE($9, acquired_cost_tiyin),
       rfid_tag           = COALESCE($10, rfid_tag),
       description        = COALESCE($11, description),
       photo_url          = COALESCE($12, photo_url),
       farm_id            = COALESCE($13, farm_id),
       status             = COALESCE($14, status),
       expected_sale_date = COALESCE($15, expected_sale_date)
     WHERE id = $1 RETURNING *`,
    [
      req.params.id, b.name, b.species, b.breed, b.sex, b.birth_date,
      b.current_weight_g, b.price_per_kg_tiyin, b.acquired_cost_tiyin, b.rfid_tag,
      b.description, b.photo_url, b.farm_id, b.status, b.expected_sale_date,
    ]
  )).rows[0]
  if (!animal) return fail(res, 'not_found', 404)

  // Правка веса через карточку тоже должна попадать в историю
  if (b.current_weight_g) {
    const last = (await pool.query(
      `SELECT weight_g FROM weight_records WHERE animal_id=$1 ORDER BY recorded_at DESC LIMIT 1`,
      [req.params.id]
    )).rows[0]
    if (!last || Number(last.weight_g) !== Number(b.current_weight_g)) {
      await pool.query(`INSERT INTO weight_records (animal_id, weight_g) VALUES ($1,$2)`, [req.params.id, b.current_weight_g])
    }
  }

  ok(res, { animal })
}))

router.delete('/admin/animals/:id', requireAdmin, asyncHandler(async (req, res) => {
  // Животное с живым договором не удаляем — за ним стоят деньги владельца
  const active = (await pool.query(
    `SELECT count(*)::int AS n FROM contracts
     WHERE animal_id = $1 AND status IN ('pending','active')`,
    [req.params.id]
  )).rows[0].n
  if (active > 0) return fail(res, 'has_active_contracts')

  // weight_records / videos / activity уходят каскадом — FK настроены
  const deleted = (await pool.query(`DELETE FROM animals WHERE id=$1 RETURNING id`, [req.params.id])).rows[0]
  if (!deleted) return fail(res, 'not_found', 404)
  ok(res, { deleted: deleted.id })
}))

/**
 * Продажа животного по договору investment.
 *
 * Из выручки сначала гасится накопленная абонплата за содержание,
 * потом считается прибыль и с неё берётся комиссия. Порядок важен:
 * комиссия с выручки означала бы, что при падении цены клиент платит
 * процент за собственный убыток.
 *
 * Договоры ownership так не закрываются — там клиент забирает животное
 * или мясо, денежного возврата нет.
 */
router.post('/admin/animals/:id/sell', requireAdmin, asyncHandler(async (req, res) => {
  const { final_weight_g, final_sale_price_tiyin } = req.body
  if (!final_sale_price_tiyin) return fail(res, 'final_sale_price_tiyin required')

  const rates = await feeRates()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const animal = (await client.query(`SELECT * FROM animals WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0]
    if (!animal) { await client.query('ROLLBACK'); return fail(res, 'not_found', 404) }
    if (animal.status === 'sold') { await client.query('ROLLBACK'); return fail(res, 'already_sold') }

    const updated = (await client.query(
      `UPDATE animals SET status='sold', final_weight_g=$1, final_sale_price_tiyin=$2, sold_at=NOW()
       WHERE id=$3 RETURNING *`,
      [final_weight_g || animal.current_weight_g, final_sale_price_tiyin, req.params.id]
    )).rows[0]

    const contract = (await client.query(
      `SELECT * FROM contracts
       WHERE animal_id=$1 AND model_type IN ('investment','ownership') AND status IN ('pending','active')
       FOR UPDATE`,
      [req.params.id]
    )).rows[0]

    // Животное могло принадлежать ферме, а не клиенту — тогда просто продаём
    if (!contract) {
      await client.query('COMMIT')
      return ok(res, { animal: updated, payout: null, note: 'no_active_ownership_contract' })
    }

    // Владение закрывается выдачей животного, а не продажей
    if (contract.model_type === 'ownership') {
      await client.query('ROLLBACK')
      return fail(res, 'ownership_contract_is_closed_by_handover')
    }

    // Добираем содержание за месяцы, которые крон ещё не успел начислить
    const accrued = Math.max(Number(contract.boarding_accrued_tiyin) || 0, boardingDue(contract))
    if (accrued !== Number(contract.boarding_accrued_tiyin)) {
      await client.query(
        `UPDATE contracts SET boarding_accrued_tiyin = $2, boarding_accrued_until = CURRENT_DATE WHERE id = $1`,
        [contract.id, accrued]
      )
      contract.boarding_accrued_tiyin = accrued
    }

    const calc = investmentPayout(contract, updated, {
      ...rates,
      salePriceTiyin: final_sale_price_tiyin,
    })

    await client.query(
      `INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET balance_tiyin = wallet_balances.balance_tiyin + $2, updated_at = NOW()`,
      [contract.user_id, calc.net]
    )
    const payout = (await client.query(
      `INSERT INTO payouts (contract_id, user_id, kind, amount_tiyin, status, paid_at)
       VALUES ($1,$2,'sale_proceeds',$3,'paid',NOW()) RETURNING *`,
      [contract.id, contract.user_id, calc.net]
    )).rows[0]
    await client.query(
      `INSERT INTO transactions (user_id, contract_id, type, amount_tiyin, description)
       VALUES ($1,$2,'payout',$3,$4)`,
      [contract.user_id, contract.id, calc.net,
       `Sale proceeds for ${animal.name}`
         + (calc.boarding ? `, boarding ${calc.boarding}` : '')
         + (calc.fee_client ? `, fee ${calc.fee_client}` : '')]
    )
    await client.query(
      `UPDATE contracts SET status='completed', payout_tiyin=$2,
              boarding_paid_tiyin = boarding_accrued_tiyin, closed_at=NOW()
       WHERE id=$1`,
      [contract.id, calc.net]
    )

    await client.query('COMMIT')
    ok(res, { animal: updated, payout, calc })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

export default router
