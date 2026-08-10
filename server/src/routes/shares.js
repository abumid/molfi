import { Router } from 'express'
import { pool } from '../db/pool.js'
import { ok, fail, asyncHandler } from '../utils/response.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const MIN_SHARE_PCT = 10
const PLATFORM_FEE_RATE = 0.03

// Единственный (канонический) эндпоинт покупки доли.
// Раньше здесь было два разных обработчика (POST / и POST /buy) с несовпадающей
// бизнес-логикой (комиссия 3% и минимум 10% проверялись только в неиспользуемом
// POST /) — оставлен один, с полными проверками и блокировкой строки барана
// внутри транзакции, чтобы избежать перепродажи долей при параллельных запросах.
router.post('/buy', requireAuth, asyncHandler(async (req, res) => {
  const { sheep_id, share_pct } = req.body
  if (!sheep_id || !share_pct) return fail(res, 'invalid_data')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Блокируем строку барана на время транзакции — без этого два параллельных
    // запроса могут оба пройти проверку "хватает ли долей" и перепродать барана.
    const sheep = (await client.query(
      `SELECT id, total_shares, sold_shares, price_tiyin, status FROM sheep WHERE id=$1 FOR UPDATE`,
      [sheep_id]
    )).rows[0]
    if (!sheep) { await client.query('ROLLBACK'); return fail(res, 'sheep_not_found', 404) }
    if (sheep.status !== 'active') { await client.query('ROLLBACK'); return fail(res, 'sheep_not_active') }

    const available = sheep.total_shares - sheep.sold_shares
    const isBuyingRemainder = share_pct === available
    if (share_pct < MIN_SHARE_PCT && !isBuyingRemainder) {
      await client.query('ROLLBACK')
      return fail(res, 'min_share_10_percent')
    }
    if (share_pct > available) { await client.query('ROLLBACK'); return fail(res, 'not_enough_shares') }

    const principal = Math.round(sheep.price_tiyin * share_pct / 100)
    const fee = Math.round(principal * PLATFORM_FEE_RATE)
    const totalCost = principal + fee

    const wallet = (await client.query(
      `SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1 FOR UPDATE`,
      [req.user.id]
    )).rows[0]
    if (!wallet || wallet.balance_tiyin < totalCost) {
      await client.query('ROLLBACK')
      return fail(res, 'insufficient_balance')
    }

    await client.query(`UPDATE wallet_balances SET balance_tiyin=balance_tiyin-$1 WHERE user_id=$2`, [totalCost, req.user.id])
    const share = (await client.query(
      `INSERT INTO shares (sheep_id, user_id, share_pct, purchase_price_tiyin, status)
       VALUES ($1,$2,$3,$4,'active') RETURNING id, sheep_id, share_pct, purchase_price_tiyin`,
      [sheep_id, req.user.id, share_pct, principal]
    )).rows[0]
    await client.query(`UPDATE sheep SET sold_shares=sold_shares+$1 WHERE id=$2`, [share_pct, sheep_id])
    await client.query(
      `INSERT INTO transactions (user_id, type, amount_tiyin, description) VALUES ($1,'share_purchase',$2,$3)`,
      [req.user.id, totalCost, `Покупка ${share_pct}% барана #${sheep_id} (комиссия 3% включена)`]
    )
    await client.query('COMMIT')
    ok(res, { share })
  } catch (e) {
    await client.query('ROLLBACK')
    fail(res, 'transaction_failed', 500)
  } finally {
    client.release()
  }
}))

router.get('/user/:id', requireAuth, asyncHandler(async (req, res) => {
  const shares = (await pool.query(
    `SELECT s.*, sh.name as sheep_name, sh.breed, sh.current_weight_g, sh.status as sheep_status
     FROM shares s JOIN sheep sh ON s.sheep_id=sh.id
     WHERE s.user_id=$1 AND s.status='active'`,
    [req.params.id]
  )).rows
  ok(res, { shares })
}))

export default router
