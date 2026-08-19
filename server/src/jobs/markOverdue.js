// Marking overdue instalments.
//
// Once a day: pending payments whose due date passed more than
// overdue_grace_days ago become overdue. A contract that has accumulated
// default_after_missed overdue payments moves to defaulted.
//
// Both values are read from settings rather than from constants: the grace
// period is what the business changes most often.

import 'dotenv/config'
import { pool } from '../db/pool.js'
import { getSettingInt } from '../utils/settings.js'

export const markOverdue = async ({ log = console.log } = {}) => {
  const graceDays = await getSettingInt('overdue_grace_days')
  const maxMissed = await getSettingInt('default_after_missed')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Overdue payments. waived and paid are left alone.
    const overdue = (await client.query(
      `UPDATE payment_schedule
       SET status = 'overdue'
       WHERE status = 'pending'
         AND due_date < (CURRENT_DATE - ($1 || ' days')::interval)
       RETURNING id, contract_id, seq, due_date`,
      [String(graceDays)]
    )).rows

    // Contracts that have piled up more overdue payments than allowed.
    // Counted across all overdue rows, not just fresh ones: a contract may
    // have reached the limit over several runs.
    const defaulted = (await client.query(
      `UPDATE contracts SET status = 'defaulted'
       WHERE model_type = 'installment'
         AND status = 'active'
         AND id IN (
           SELECT contract_id FROM payment_schedule
           WHERE status = 'overdue'
           GROUP BY contract_id
           HAVING count(*) >= $1
         )
       RETURNING id, user_id`,
      [maxMissed]
    )).rows

    await client.query('COMMIT')

    log(`[markOverdue] grace ${graceDays} d., threshold ${maxMissed}: overdue ${overdue.length}, contracts defaulted ${defaulted.length}`)
    return { graceDays, maxMissed, overdue: overdue.length, defaulted: defaulted.length, overdueRows: overdue, defaultedRows: defaulted }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// Manual run: npm run job:overdue
if (import.meta.url === `file://${process.argv[1]}`) {
  await markOverdue()
  process.exit(0)
}
