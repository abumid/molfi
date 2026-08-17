import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { getSettingInt } from '../utils/settings.js'
import { installmentSummary, lateFee } from '../utils/calculations.js'

const router = Router()

const loadContract = (id) =>
  pool.query(`SELECT * FROM contracts WHERE id = $1`, [id]).then(r => r.rows[0])

// ── график ────────────────────────────────────────────────

router.get('/payments/schedule/:contractId', requireAuth, asyncHandler(async (req, res) => {
  const contract = await loadContract(req.params.contractId)
  if (!contract) return fail(res, 'not_found', 404)
  if (contract.user_id !== req.user.id && req.user.role !== 'admin')
    return fail(res, 'Forbidden', 403)

  const schedule = (await pool.query(
    `SELECT * FROM payment_schedule WHERE contract_id = $1 ORDER BY seq`,
    [req.params.contractId]
  )).rows

  const lateFeeBp = await getSettingInt('late_fee_bp')
  const withFees = schedule.map(p => ({
    ...p,
    late_fee_tiyin: p.status === 'overdue' ? lateFee(p, lateFeeBp) : 0,
  }))

  ok(res, { schedule: withFees, summary: installmentSummary(contract, schedule) })
}))

// ── оплата очередного платежа ─────────────────────────────

router.post('/payments/pay', requireAuth, asyncHandler(async (req, res) => {
  const { contract_id, schedule_id } = req.body
  if (!contract_id) return fail(res, 'contract_id required')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const contract = (await client.query(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`,
      [contract_id]
    )).rows[0]
    if (!contract) { await client.query('ROLLBACK'); return fail(res, 'contract_not_found', 404) }
    if (contract.user_id !== req.user.id) { await client.query('ROLLBACK'); return fail(res, 'Forbidden', 403) }
    if (contract.model_type !== 'installment') {
      await client.query('ROLLBACK')
      return fail(res, 'only_installment_has_schedule')
    }
    if (contract.status === 'cancelled') { await client.query('ROLLBACK'); return fail(res, 'contract_cancelled') }

    // Конкретный платёж или ближайший неоплаченный. Блокируем строку,
    // иначе двойной тап по кнопке оплатит один платёж дважды.
    const installment = (await client.query(
      schedule_id
        ? `SELECT * FROM payment_schedule WHERE id = $2 AND contract_id = $1 FOR UPDATE`
        : `SELECT * FROM payment_schedule WHERE contract_id = $1 AND status IN ('pending','overdue')
           ORDER BY seq LIMIT 1 FOR UPDATE`,
      schedule_id ? [contract_id, schedule_id] : [contract_id]
    )).rows[0]

    if (!installment) { await client.query('ROLLBACK'); return fail(res, 'nothing_to_pay') }
    if (installment.status === 'paid') { await client.query('ROLLBACK'); return fail(res, 'already_paid') }
    if (installment.status === 'waived') { await client.query('ROLLBACK'); return fail(res, 'already_waived') }

    const due = Number(installment.amount_tiyin) - Number(installment.paid_tiyin || 0)
    const lateFeeBp = await getSettingInt('late_fee_bp')
    const penalty = installment.status === 'overdue' ? lateFee(installment, lateFeeBp) : 0
    const total = due + penalty

    const wallet = (await client.query(
      `SELECT balance_tiyin FROM wallet_balances WHERE user_id = $1 FOR UPDATE`,
      [req.user.id]
    )).rows[0]
    if (!wallet || Number(wallet.balance_tiyin) < total) {
      await client.query('ROLLBACK')
      return fail(res, 'insufficient_balance')
    }

    await client.query(
      `UPDATE wallet_balances SET balance_tiyin = balance_tiyin - $1, updated_at = NOW() WHERE user_id = $2`,
      [total, req.user.id]
    )
    const paid = (await client.query(
      `UPDATE payment_schedule
       SET paid_tiyin = amount_tiyin, status = 'paid', paid_at = NOW()
       WHERE id = $1 RETURNING *`,
      [installment.id]
    )).rows[0]

    await client.query(
      `UPDATE contracts SET paid_tiyin = paid_tiyin + $1 WHERE id = $2`,
      [due, contract_id]
    )
    await client.query(
      `INSERT INTO transactions (user_id, contract_id, type, amount_tiyin, description)
       VALUES ($1,$2,'installment_payment',$3,$4)`,
      [req.user.id, contract_id, -total,
       `Платёж ${installment.seq} по договору #${contract_id}` + (penalty ? ` (пеня ${penalty})` : '')]
    )

    // Последний платёж закрывает договор
    const left = (await client.query(
      `SELECT count(*)::int AS n FROM payment_schedule
       WHERE contract_id = $1 AND status NOT IN ('paid','waived')`,
      [contract_id]
    )).rows[0].n

    let contractStatus = contract.status
    if (left === 0) {
      await client.query(
        `UPDATE contracts SET status = 'completed', closed_at = NOW() WHERE id = $1`,
        [contract_id]
      )
      contractStatus = 'completed'
    }

    await client.query('COMMIT')
    ok(res, { payment: paid, penalty_tiyin: penalty, charged_tiyin: total, remaining_payments: left, contract_status: contractStatus })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

// ── админ ─────────────────────────────────────────────────

router.post('/admin/payments/:id/waive', requireAdmin, asyncHandler(async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const installment = (await client.query(
      `SELECT * FROM payment_schedule WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    )).rows[0]
    if (!installment) { await client.query('ROLLBACK'); return fail(res, 'not_found', 404) }
    if (installment.status === 'paid') { await client.query('ROLLBACK'); return fail(res, 'already_paid') }

    const waived = (await client.query(
      `UPDATE payment_schedule SET status = 'waived' WHERE id = $1 RETURNING *`,
      [req.params.id]
    )).rows[0]

    // Прощённый платёж тоже закрывает договор, если он был последним
    const left = (await client.query(
      `SELECT count(*)::int AS n FROM payment_schedule
       WHERE contract_id = $1 AND status NOT IN ('paid','waived')`,
      [installment.contract_id]
    )).rows[0].n

    if (left === 0) {
      await client.query(
        `UPDATE contracts SET status = 'completed', closed_at = NOW() WHERE id = $1`,
        [installment.contract_id]
      )
    }

    await client.query('COMMIT')
    ok(res, { payment: waived, remaining_payments: left })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

router.get('/admin/payments', requireAdmin, asyncHandler(async (req, res) => {
  const { status, contract_id } = req.query
  const payments = (await pool.query(
    `SELECT ps.*, c.model_type, c.user_id, u.name AS user_name, u.phone AS user_phone
     FROM payment_schedule ps
     JOIN contracts c ON c.id = ps.contract_id
     JOIN users u ON u.id = c.user_id
     WHERE ($1::text IS NULL OR ps.status = $1)
       AND ($2::int IS NULL OR ps.contract_id = $2)
     ORDER BY ps.due_date, ps.seq`,
    [status || null, contract_id || null]
  )).rows
  ok(res, { payments })
}))

export default router
