import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { enabledModels, feeRates, boardingFeeMonthly } from '../utils/settings.js'
import {
  buildSchedule, installmentSummary, investmentPayout, ownershipSummary,
  purchaseFee, purchaseTotal, addMonths,
} from '../utils/calculations.js'

const router = Router()

const MODELS = ['investment', 'ownership', 'installment']
const STATUSES = ['pending', 'active', 'completed', 'cancelled', 'defaulted']

const SELECT_CONTRACT = `
  SELECT c.*,
         p.title_en, p.title_ru, p.title_uz, p.photo_url,
         p.meat_weight_g, p.price_tiyin AS product_price_tiyin,
         a.name             AS animal_name,
         a.breed            AS animal_breed,
         a.species          AS animal_species,
         a.current_weight_g AS animal_weight_g,
         a.status           AS animal_status,
         a.final_sale_price_tiyin,
         a.price_per_kg_tiyin
  FROM contracts c
  JOIN products p ON p.id = c.product_id
  LEFT JOIN animals a ON a.id = c.animal_id
`

/**
 * Сколько списать с кошелька при оформлении.
 *   investment / ownership — цена животного плюс комиссия покупки
 *   installment            — ничего: смысл рассрочки в том, чтобы платить потом
 */
const upfrontCost = (product, purchaseFeeBp) =>
  product.model_type === 'installment'
    ? 0
    : purchaseTotal(product.price_tiyin, purchaseFeeBp)

const isoMonths = (date, months) => addMonths(date, Number(months || 0)).toISOString().slice(0, 10)

// ── оформление ────────────────────────────────────────────

/**
 * Создание договора. Вынесено из роута, потому что оформлять могут двое:
 * клиент сам через приложение и админ за клиента, который пришёл на ферму.
 * Логика обязана быть одна — иначе списания и проверки разъедутся.
 *
 * Транзакцией управляет вызывающий: ему может понадобиться откатить
 * и то, что он делал до нас.
 */
const createContract = async (client, userId, { product_id, exit_type }) => {
  // Блокируем оффер: без этого два параллельных запроса разберут
  // последний слот дважды и slots_taken уедет выше slots_total.
  const product = (await client.query(
    `SELECT * FROM products WHERE id = $1 FOR UPDATE`, [product_id]
  )).rows[0]
  if (!product) return { error: 'product_not_found', status: 404 }
  if (product.status !== 'active') return { error: 'product_not_active' }

  // Спрятанную модель нельзя оформить, даже зная product_id напрямую
  if (!(await enabledModels()).includes(product.model_type)) return { error: 'model_disabled' }
  if (product.slots_taken >= product.slots_total) return { error: 'no_slots_left' }

  const principal = Number(product.price_tiyin)
  if (!principal) return { error: 'product_has_no_price' }

  const { purchaseFeeBp } = await feeRates()
  const cost = upfrontCost(product, purchaseFeeBp)
  const fee = product.model_type === 'installment' ? 0 : purchaseFee(principal, purchaseFeeBp)

  if (cost > 0) {
    const wallet = (await client.query(
      `SELECT balance_tiyin FROM wallet_balances WHERE user_id = $1 FOR UPDATE`, [userId]
    )).rows[0]
    if (!wallet || Number(wallet.balance_tiyin) < cost) return { error: 'insufficient_balance' }
    await client.query(
      `UPDATE wallet_balances SET balance_tiyin = balance_tiyin - $1, updated_at = NOW() WHERE user_id = $2`,
      [cost, userId]
    )
  }

  // Животное закрепляется сразу у обеих моделей с животным.
  // У installment оно назначается позже, при отгрузке.
  const animalId = product.model_type === 'installment' ? null : product.animal_id

  // Абонплату фиксируем в договоре: подняли тариф — старые договоры
  // должны остаться на своей цене
  const boardingFee = product.model_type === 'installment'
    ? null
    : (Number(product.boarding_fee_monthly_tiyin) || await boardingFeeMonthly())

  const contract = (await client.query(
    `INSERT INTO contracts
       (user_id, product_id, animal_id, model_type, status,
        principal_tiyin, paid_tiyin, term_months, exit_type, matures_at,
        boarding_fee_monthly_tiyin, boarding_accrued_until)
     VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,CURRENT_DATE)
     RETURNING *`,
    [
      userId, product.id, animalId, product.model_type,
      principal, cost, product.term_months || null,
      product.model_type === 'investment' ? 'sale'
        : product.model_type === 'ownership' ? (exit_type || 'slaughter')
        : null,
      product.term_months ? isoMonths(new Date(), product.term_months) : null,
      boardingFee,
    ]
  )).rows[0]

  const schedule = []
  if (product.model_type === 'installment') {
    for (const p of buildSchedule(principal, product.term_months)) {
      schedule.push((await client.query(
        `INSERT INTO payment_schedule (contract_id, seq, due_date, amount_tiyin)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [contract.id, p.seq, p.due_date, p.amount_tiyin]
      )).rows[0])
    }
  }

  if (animalId) {
    await client.query(`UPDATE animals SET status = 'owned' WHERE id = $1`, [animalId])
  }

  await client.query(
    `UPDATE products SET slots_taken = slots_taken + 1,
       status = CASE WHEN slots_taken + 1 >= slots_total THEN 'sold_out' ELSE status END
     WHERE id = $1`,
    [product.id]
  )

  if (cost > 0) {
    await client.query(
      `INSERT INTO transactions (user_id, contract_id, type, amount_tiyin, description)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, contract.id, 'contract_purchase', -cost,
       `Contract #${contract.id} opened (${product.model_type})`
         + (fee ? ` incl. purchase fee ${fee}` : '')]
    )
  }

  return { contract, schedule }
}

/** Гонка за животное превращается в понятный ответ, а не в 500. */
const asRaceError = (e) =>
  e.code === '23505' && e.constraint === 'contracts_one_owner_per_animal'

router.post('/contracts', requireAuth, asyncHandler(async (req, res) => {
  const { product_id, exit_type } = req.body
  if (!product_id) return fail(res, 'product_id required')
  if (exit_type && !['sale', 'slaughter'].includes(exit_type)) return fail(res, 'invalid_exit_type')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await createContract(client, req.user.id, { product_id, exit_type })
    if (result.error) {
      await client.query('ROLLBACK')
      return fail(res, result.error, result.status || 400)
    }
    await client.query('COMMIT')
    ok(res, result)
  } catch (e) {
    await client.query('ROLLBACK')
    if (asRaceError(e)) return fail(res, 'animal_already_sold', 409)
    throw e
  } finally {
    client.release()
  }
}))

/**
 * Оформление за клиента. Нужно, когда человек пришёл на ферму лично:
 * без этого договор можно создать только из приложения, а оно есть не у всех.
 */
router.post('/admin/contracts', requireAdmin, asyncHandler(async (req, res) => {
  const { user_id, product_id, exit_type } = req.body
  if (!user_id) return fail(res, 'user_id required')
  if (!product_id) return fail(res, 'product_id required')
  if (exit_type && !['sale', 'slaughter'].includes(exit_type)) return fail(res, 'invalid_exit_type')

  const user = (await pool.query(`SELECT id FROM users WHERE id = $1`, [user_id])).rows[0]
  if (!user) return fail(res, 'user_not_found', 404)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await createContract(client, user_id, { product_id, exit_type })
    if (result.error) {
      await client.query('ROLLBACK')
      return fail(res, result.error, result.status || 400)
    }
    await client.query('COMMIT')
    ok(res, result)
  } catch (e) {
    await client.query('ROLLBACK')
    if (asRaceError(e)) return fail(res, 'animal_already_sold', 409)
    throw e
  } finally {
    client.release()
  }
}))

/**
 * Сводка по договору. У каждой модели своя: investment показывает,
 * сколько выйдет при продаже сейчас, ownership — сколько накопилось
 * за содержание, installment — прогресс по графику.
 */
const summarize = (c, rates, schedule = []) => {
  if (c.model_type === 'installment') return installmentSummary(c, schedule)
  if (c.model_type === 'ownership') return ownershipSummary(c)
  return investmentPayout(c, {
    current_weight_g: c.animal_weight_g,
    price_per_kg_tiyin: c.price_per_kg_tiyin,
  }, { ...rates, salePriceTiyin: c.final_sale_price_tiyin || null })
}

// ── мои договоры ──────────────────────────────────────────

router.get('/contracts', requireAuth, asyncHandler(async (req, res) => {
  const contracts = (await pool.query(
    `${SELECT_CONTRACT} WHERE c.user_id = $1 ORDER BY c.created_at DESC`,
    [req.user.id]
  )).rows

  const rates = await feeRates()

  // Графики забираем одним запросом на все договоры, а не по одному в цикле
  const installmentIds = contracts.filter(c => c.model_type === 'installment').map(c => c.id)
  const scheduleRows = installmentIds.length
    ? (await pool.query(
        `SELECT * FROM payment_schedule WHERE contract_id = ANY($1) ORDER BY seq`,
        [installmentIds]
      )).rows
    : []

  const byContract = scheduleRows.reduce((acc, r) => {
    (acc[r.contract_id] ||= []).push(r)
    return acc
  }, {})

  const withSummary = contracts.map(c => ({
    ...c,
    summary: summarize(c, rates, byContract[c.id] || []),
  }))

  ok(res, { contracts: withSummary })
}))

router.get('/contracts/:id', requireAuth, asyncHandler(async (req, res) => {
  const contract = (await pool.query(`${SELECT_CONTRACT} WHERE c.id = $1`, [req.params.id])).rows[0]
  if (!contract) return fail(res, 'not_found', 404)
  if (contract.user_id !== req.user.id && req.user.role !== 'admin')
    return fail(res, 'Forbidden', 403)

  const [schedule, payouts, deliveries] = await Promise.all([
    pool.query(`SELECT * FROM payment_schedule WHERE contract_id=$1 ORDER BY seq`, [req.params.id]),
    pool.query(`SELECT * FROM payouts WHERE contract_id=$1 ORDER BY created_at DESC`, [req.params.id]),
    pool.query(`SELECT * FROM deliveries WHERE contract_id=$1 ORDER BY created_at DESC`, [req.params.id]),
  ])

  const rates = await feeRates()
  const summary = summarize(contract, rates, schedule.rows)

  ok(res, {
    contract,
    summary,
    schedule: schedule.rows,
    payouts: payouts.rows,
    deliveries: deliveries.rows,
  })
}))

// ── админ ─────────────────────────────────────────────────

router.get('/admin/contracts', requireAdmin, asyncHandler(async (req, res) => {
  const { model_type, status } = req.query
  if (model_type && !MODELS.includes(model_type)) return fail(res, 'unknown_model')
  if (status && !STATUSES.includes(status)) return fail(res, 'unknown_status')

  const contracts = (await pool.query(
    `SELECT c.*,
            p.title_en, p.title_ru, p.title_uz, p.meat_weight_g,
            a.name AS animal_name, a.species AS animal_species, a.status AS animal_status,
            u.name AS user_name, u.phone AS user_phone,
            (SELECT count(*)::int FROM payment_schedule s WHERE s.contract_id = c.id) AS payments_total,
            (SELECT count(*)::int FROM payment_schedule s WHERE s.contract_id = c.id AND s.status = 'paid') AS payments_paid,
            (SELECT count(*)::int FROM payment_schedule s WHERE s.contract_id = c.id AND s.status = 'overdue') AS payments_overdue,
            c.boarding_accrued_tiyin, c.boarding_paid_tiyin
     FROM contracts c
     JOIN products p ON p.id = c.product_id
     JOIN users u ON u.id = c.user_id
     LEFT JOIN animals a ON a.id = c.animal_id
     WHERE ($1::text IS NULL OR c.model_type = $1)
       AND ($2::text IS NULL OR c.status = $2)
     ORDER BY c.created_at DESC`,
    [model_type || null, status || null]
  )).rows

  ok(res, { contracts })
}))

router.put('/admin/contracts/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { status } = req.body
  if (!STATUSES.includes(status)) return fail(res, 'unknown_status')

  const contract = (await pool.query(
    `UPDATE contracts
     SET status = $2,
         closed_at = CASE WHEN $2 IN ('completed','cancelled') THEN NOW() ELSE closed_at END
     WHERE id = $1 RETURNING *`,
    [req.params.id, status]
  )).rows[0]
  if (!contract) return fail(res, 'not_found', 404)

  ok(res, { contract })
}))

export default router
