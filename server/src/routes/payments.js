import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { getSettingInt } from '../utils/settings.js'
import { installmentSummary, lateFee, boardingOutstanding } from '../utils/calculations.js'

const router = Router()

const loadContract = (id) =>
  pool.query(`SELECT * FROM contracts WHERE id = $1`, [id]).then(r => r.rows[0])

// ── schedule ──────────────────────────────────────────────

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

// ── paying the next instalment ────────────────────────────

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

    // A specific instalment, or the nearest unpaid one. The row is locked,
    // otherwise a double tap on the button pays one instalment twice.
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
       `Instalment ${installment.seq} of contract #${contract_id}` + (penalty ? ` (late fee ${penalty})` : '')]
    )

    // The last instalment closes the contract
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

// ── admin ─────────────────────────────────────────────────

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

    // A waived instalment also closes the contract if it was the last one
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

/**
 * Mark an instalment as received, bypassing the wallet. Needed when the client
 * paid in cash or by transfer to the farm account: the money arrived, but not
 * through the platform. The wallet and transactions are deliberately untouched —
 * otherwise the balance shows funds the client does not have, and reconciliation stops adding up.
 */
router.post('/admin/payments/:id/mark-paid', requireAdmin, asyncHandler(async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const installment = (await client.query(
      `SELECT * FROM payment_schedule WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    )).rows[0]
    if (!installment) { await client.query('ROLLBACK'); return fail(res, 'not_found', 404) }
    if (installment.status === 'paid') { await client.query('ROLLBACK'); return fail(res, 'already_paid') }
    if (installment.status === 'waived') { await client.query('ROLLBACK'); return fail(res, 'already_waived') }

    const due = Number(installment.amount_tiyin) - Number(installment.paid_tiyin || 0)

    const paid = (await client.query(
      `UPDATE payment_schedule
       SET paid_tiyin = amount_tiyin, status = 'paid', paid_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    )).rows[0]

    await client.query(
      `UPDATE contracts SET paid_tiyin = paid_tiyin + $1 WHERE id = $2`,
      [due, installment.contract_id]
    )

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
    ok(res, { payment: paid, remaining_payments: left, offline: true })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

/**
 * Paying off the accumulated boarding fee.
 * Needed by the ownership model: there is no sale there, so the debt cannot be
 * settled out of proceeds — the client pays it from the wallet instead.
 */
router.post('/payments/boarding', requireAuth, asyncHandler(async (req, res) => {
  const { contract_id, amount_tiyin } = req.body
  if (!contract_id) return fail(res, 'contract_id required')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const contract = (await client.query(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`, [contract_id]
    )).rows[0]
    if (!contract) { await client.query('ROLLBACK'); return fail(res, 'contract_not_found', 404) }
    if (contract.user_id !== req.user.id) { await client.query('ROLLBACK'); return fail(res, 'Forbidden', 403) }

    const outstanding = boardingOutstanding(contract)
    if (outstanding <= 0) { await client.query('ROLLBACK'); return fail(res, 'nothing_to_pay') }

    // Partial payment is allowed: a year of debt can be too much in one go
    const amount = amount_tiyin ? Math.min(Number(amount_tiyin), outstanding) : outstanding
    if (amount <= 0) { await client.query('ROLLBACK'); return fail(res, 'invalid_amount') }

    const wallet = (await client.query(
      `SELECT balance_tiyin FROM wallet_balances WHERE user_id = $1 FOR UPDATE`, [req.user.id]
    )).rows[0]
    if (!wallet || Number(wallet.balance_tiyin) < amount) {
      await client.query('ROLLBACK')
      return fail(res, 'insufficient_balance')
    }

    await client.query(
      `UPDATE wallet_balances SET balance_tiyin = balance_tiyin - $1, updated_at = NOW() WHERE user_id = $2`,
      [amount, req.user.id]
    )
    const updated = (await client.query(
      `UPDATE contracts SET boarding_paid_tiyin = boarding_paid_tiyin + $2 WHERE id = $1 RETURNING *`,
      [contract_id, amount]
    )).rows[0]
    await client.query(
      `INSERT INTO transactions (user_id, contract_id, type, amount_tiyin, description)
       VALUES ($1,$2,'boarding_payment',$3,$4)`,
      [req.user.id, contract_id, -amount, `Boarding fee for contract #${contract_id}`]
    )

    await client.query('COMMIT')
    ok(res, { contract: updated, paid_tiyin: amount, outstanding_tiyin: boardingOutstanding(updated) })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

/**
 * A boarding payment recorded by an admin.
 *
 * from_wallet = true  — the client pays from the platform balance, as in the app
 * from_wallet = false — the money came in cash or by transfer outside the
 *                       platform: the debt is settled, the wallet is untouched,
 *                       or the balance would show funds not held here
 */
router.post('/admin/contracts/:id/boarding', requireAdmin, asyncHandler(async (req, res) => {
  const { amount_tiyin, from_wallet = false } = req.body

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const contract = (await client.query(
      `SELECT * FROM contracts WHERE id = $1 FOR UPDATE`, [req.params.id]
    )).rows[0]
    if (!contract) { await client.query('ROLLBACK'); return fail(res, 'not_found', 404) }

    const outstanding = boardingOutstanding(contract)
    if (outstanding <= 0) { await client.query('ROLLBACK'); return fail(res, 'nothing_to_pay') }

    // Partial payment is allowed: a year of debt can be too much in one go
    const amount = amount_tiyin ? Math.min(Number(amount_tiyin), outstanding) : outstanding
    if (amount <= 0) { await client.query('ROLLBACK'); return fail(res, 'invalid_amount') }

    if (from_wallet) {
      const wallet = (await client.query(
        `SELECT balance_tiyin FROM wallet_balances WHERE user_id = $1 FOR UPDATE`,
        [contract.user_id]
      )).rows[0]
      if (!wallet || Number(wallet.balance_tiyin) < amount) {
        await client.query('ROLLBACK')
        return fail(res, 'insufficient_balance')
      }
      await client.query(
        `UPDATE wallet_balances SET balance_tiyin = balance_tiyin - $1, updated_at = NOW() WHERE user_id = $2`,
        [amount, contract.user_id]
      )
      await client.query(
        `INSERT INTO transactions (user_id, contract_id, type, amount_tiyin, description)
         VALUES ($1,$2,'boarding_payment',$3,$4)`,
        [contract.user_id, contract.id, -amount, `Boarding fee for contract #${contract.id}`]
      )
    }

    const updated = (await client.query(
      `UPDATE contracts SET boarding_paid_tiyin = boarding_paid_tiyin + $2 WHERE id = $1 RETURNING *`,
      [req.params.id, amount]
    )).rows[0]

    await client.query('COMMIT')
    ok(res, {
      contract: updated,
      paid_tiyin: amount,
      outstanding_tiyin: boardingOutstanding(updated),
      from_wallet: !!from_wallet,
    })
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

// ─────────────────────────────────────────────────────────────
// Top-up and withdrawal requests
//
// Until Click and Payme are connected, an admin moves the money. The client
// leaves a request with an amount, an admin approves it — and only at that
// moment is a transaction created and the balance changed. A request on its
// own does not affect the balance: otherwise someone could "top up" their
// wallet without paying anything.
// ─────────────────────────────────────────────────────────────

const REQUEST_KINDS = ['topup', 'withdrawal']

// Guards against a typo adding a zero, and against requests for pennies
const MIN_REQUEST_TIYIN = 1000 * 100      // 1,000 sum
const MAX_REQUEST_TIYIN = 500_000_000 * 100 // 500 million sum

router.post('/payment-requests', requireAuth, asyncHandler(async (req, res) => {
  const { kind, amount_tiyin, note } = req.body
  if (!REQUEST_KINDS.includes(kind)) return fail(res, 'kind must be topup or withdrawal')

  const amount = Math.round(Number(amount_tiyin))
  if (!Number.isFinite(amount) || amount < MIN_REQUEST_TIYIN) return fail(res, 'amount_too_small')
  if (amount > MAX_REQUEST_TIYIN) return fail(res, 'amount_too_large')

  // One open request per kind: otherwise someone piles up a dozen identical
  // ones and the admin has to guess which to approve
  const pending = (await pool.query(
    `SELECT id FROM payment_requests WHERE user_id=$1 AND kind=$2 AND status='pending'`,
    [req.user.id, kind]
  )).rows[0]
  if (pending) return fail(res, 'request_already_pending')

  // Withdrawing more than the free balance is not allowed — checked upfront so
  // the person does not wait a day for a refusal
  if (kind === 'withdrawal') {
    const wallet = (await pool.query(
      `SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`, [req.user.id]
    )).rows[0]
    if (!wallet || Number(wallet.balance_tiyin) < amount) return fail(res, 'insufficient_balance')
  }

  const request = (await pool.query(
    `INSERT INTO payment_requests (user_id, kind, amount_tiyin, note)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.id, kind, amount, note?.slice(0, 300) || null]
  )).rows[0]

  res.status(201).json({ success: true, request })
}))

router.get('/payment-requests', requireAuth, asyncHandler(async (req, res) => {
  const requests = (await pool.query(
    `SELECT * FROM payment_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [req.user.id]
  )).rows
  ok(res, { requests })
}))

/** Cancel your own request while it is still under review. */
router.delete('/payment-requests/:id', requireAuth, asyncHandler(async (req, res) => {
  const deleted = (await pool.query(
    `DELETE FROM payment_requests
     WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING id`,
    [req.params.id, req.user.id]
  )).rows[0]
  if (!deleted) return fail(res, 'not_found_or_already_decided', 404)
  ok(res, { deleted: deleted.id })
}))

router.get('/admin/payment-requests', requireAdmin, asyncHandler(async (req, res) => {
  const { status } = req.query
  const requests = (await pool.query(
    `SELECT r.*, u.phone AS user_phone, u.name AS user_name,
            COALESCE(w.balance_tiyin, 0) AS user_balance_tiyin
     FROM payment_requests r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN wallet_balances w ON w.user_id = r.user_id
     WHERE ($1::text IS NULL OR r.status = $1)
     ORDER BY (r.status = 'pending') DESC, r.created_at DESC
     LIMIT 200`,
    [status || null]
  )).rows
  ok(res, { requests })
}))

router.post('/admin/payment-requests/:id/approve', requireAdmin, asyncHandler(async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // The request is locked: two admins can press "approve" at the same time,
    // and without the lock the money would be credited twice
    const request = (await client.query(
      `SELECT * FROM payment_requests WHERE id=$1 FOR UPDATE`, [req.params.id]
    )).rows[0]
    if (!request) { await client.query('ROLLBACK'); return fail(res, 'not_found', 404) }
    if (request.status !== 'pending') {
      await client.query('ROLLBACK')
      return fail(res, `already_${request.status}`)
    }

    const amount = Number(request.amount_tiyin)
    const isTopup = request.kind === 'topup'

    await client.query(
      `INSERT INTO wallet_balances (user_id, balance_tiyin) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [request.user_id]
    )
    const wallet = (await client.query(
      `SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1 FOR UPDATE`,
      [request.user_id]
    )).rows[0]

    // The balance may have dropped while waiting — a purchase or another payout
    if (!isTopup && Number(wallet.balance_tiyin) < amount) {
      await client.query('ROLLBACK')
      return fail(res, 'insufficient_balance')
    }

    await client.query(
      `UPDATE wallet_balances SET balance_tiyin = balance_tiyin + $1, updated_at = NOW()
       WHERE user_id = $2`,
      [isTopup ? amount : -amount, request.user_id]
    )

    const tx = (await client.query(
      `INSERT INTO transactions (user_id, type, amount_tiyin, description)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [request.user_id, isTopup ? 'topup' : 'withdrawal',
       isTopup ? amount : -amount,
       `Payment request #${request.id} approved`]
    )).rows[0]

    const updated = (await client.query(
      `UPDATE payment_requests
       SET status='approved', decided_at=NOW(), decided_by=$2,
           admin_comment=$3, transaction_id=$4
       WHERE id=$1 RETURNING *`,
      [request.id, req.user.id, req.body?.comment?.slice(0, 300) || null, tx.id]
    )).rows[0]

    await client.query('COMMIT')
    ok(res, { request: updated, transaction: tx })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}))

router.post('/admin/payment-requests/:id/reject', requireAdmin, asyncHandler(async (req, res) => {
  const updated = (await pool.query(
    `UPDATE payment_requests
     SET status='rejected', decided_at=NOW(), decided_by=$2, admin_comment=$3
     WHERE id=$1 AND status='pending' RETURNING *`,
    [req.params.id, req.user.id, req.body?.comment?.slice(0, 300) || null]
  )).rows[0]
  if (!updated) return fail(res, 'not_found_or_already_decided', 404)
  ok(res, { request: updated })
}))

export default router
