import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { getSettingInt } from '../utils/settings.js'
import { buildSchedule, installmentSummary, fixedIncomeMaturity, ownershipPayout } from '../utils/calculations.js'

const router = Router()

const MODELS = ['ownership', 'installment', 'fixed_income']
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
 * Сколько списать с кошелька в момент оформления.
 *   ownership    — вся цена сразу, животное переходит владельцу
 *   fixed_income — сумма вклада
 *   installment  — ничего: смысл рассрочки в том, чтобы платить потом
 */
const upfrontCost = (product, amountTiyin) => {
  switch (product.model_type) {
    case 'ownership': return Number(product.price_tiyin)
    case 'fixed_income': return Number(amountTiyin)
    case 'installment': return 0
    default: return 0
  }
}

const addMonths = (date, months) => {
  const d = new Date(date)
  d.setMonth(d.getMonth() + Number(months || 0))
  return d.toISOString().slice(0, 10)
}

// ── оформление ────────────────────────────────────────────

router.post('/contracts', requireAuth, asyncHandler(async (req, res) => {
  const { product_id, amount_tiyin, exit_type } = req.body
  if (!product_id) return fail(res, 'product_id required')
  if (exit_type && !['sale', 'slaughter'].includes(exit_type)) return fail(res, 'invalid_exit_type')

  const minInvestment = await getSettingInt('min_investment_tiyin')
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // Блокируем оффер: без этого два параллельных запроса разберут
    // последний слот дважды и slots_taken уедет выше slots_total.
    const product = (await client.query(
      `SELECT * FROM products WHERE id = $1 FOR UPDATE`,
      [product_id]
    )).rows[0]
    if (!product) { await client.query('ROLLBACK'); return fail(res, 'product_not_found', 404) }
    if (product.status !== 'active') { await client.query('ROLLBACK'); return fail(res, 'product_not_active') }
    if (product.slots_taken >= product.slots_total) {
      await client.query('ROLLBACK')
      return fail(res, 'no_slots_left')
    }

    // Сумма договора
    let principal
    if (product.model_type === 'fixed_income') {
      principal = Number(amount_tiyin)
      if (!principal || principal <= 0) { await client.query('ROLLBACK'); return fail(res, 'amount_tiyin required') }
      const floor = Number(product.min_amount_tiyin) || minInvestment
      if (principal < floor) {
        await client.query('ROLLBACK')
        return fail(res, `amount below minimum (${floor} tiyin)`)
      }
    } else {
      principal = Number(product.price_tiyin)
      if (!principal) { await client.query('ROLLBACK'); return fail(res, 'product has no price') }
    }

    const cost = upfrontCost(product, principal)

    if (cost > 0) {
      const wallet = (await client.query(
        `SELECT balance_tiyin FROM wallet_balances WHERE user_id = $1 FOR UPDATE`,
        [req.user.id]
      )).rows[0]
      if (!wallet || Number(wallet.balance_tiyin) < cost) {
        await client.query('ROLLBACK')
        return fail(res, 'insufficient_balance')
      }
      await client.query(
        `UPDATE wallet_balances SET balance_tiyin = balance_tiyin - $1, updated_at = NOW() WHERE user_id = $2`,
        [cost, req.user.id]
      )
    }

    // Для installment животное назначается позже, при отгрузке
    const animalId = product.model_type === 'ownership' ? product.animal_id : null

    const contract = (await client.query(
      `INSERT INTO contracts
         (user_id, product_id, animal_id, model_type, status,
          principal_tiyin, paid_tiyin, term_months, annual_rate_bp, exit_type, matures_at)
       VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.user.id, product.id, animalId, product.model_type,
        principal, cost, product.term_months || null, product.annual_rate_bp || null,
        product.model_type === 'ownership' ? (exit_type || 'sale') : null,
        product.term_months ? addMonths(new Date(), product.term_months) : null,
      ]
    )).rows[0]

    // График рассрочки
    let schedule = []
    if (product.model_type === 'installment') {
      const rows = buildSchedule(principal, product.term_months)
      for (const p of rows) {
        const inserted = (await client.query(
          `INSERT INTO payment_schedule (contract_id, seq, due_date, amount_tiyin)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [contract.id, p.seq, p.due_date, p.amount_tiyin]
        )).rows[0]
        schedule.push(inserted)
      }
    }

    if (product.model_type === 'ownership') {
      await client.query(`UPDATE animals SET status = 'owned' WHERE id = $1`, [product.animal_id])
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
        [req.user.id, contract.id, 'contract_purchase', -cost,
         `Оформление договора #${contract.id} (${product.model_type})`]
      )
    }

    await client.query('COMMIT')
    ok(res, { contract, schedule })
  } catch (e) {
    await client.query('ROLLBACK')

    // Гонка за животное. Проверкой SELECT её не закрыть — два запроса
    // пройдут проверку одновременно, поэтому полагаемся на уникальный
    // индекс contracts_one_owner_per_animal и переводим 23505 в текст.
    if (e.code === '23505' && e.constraint === 'contracts_one_owner_per_animal')
      return fail(res, 'animal_already_sold', 409)

    throw e
  } finally {
    client.release()
  }
}))

// ── мои договоры ──────────────────────────────────────────

router.get('/contracts', requireAuth, asyncHandler(async (req, res) => {
  const contracts = (await pool.query(
    `${SELECT_CONTRACT} WHERE c.user_id = $1 ORDER BY c.created_at DESC`,
    [req.user.id]
  )).rows

  const feeBp = await getSettingInt('platform_fee_bp')

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
    summary:
      c.model_type === 'installment' ? installmentSummary(c, byContract[c.id] || [])
      : c.model_type === 'fixed_income' ? fixedIncomeMaturity(c)
      : ownershipPayout(c, c, feeBp),
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

  const feeBp = await getSettingInt('platform_fee_bp')
  const summary =
    contract.model_type === 'installment' ? installmentSummary(contract, schedule.rows)
    : contract.model_type === 'fixed_income' ? fixedIncomeMaturity(contract)
    : ownershipPayout(contract, contract, feeBp)

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
            (SELECT count(*)::int FROM payouts o WHERE o.contract_id = c.id AND o.kind = 'interest') AS interest_periods
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
