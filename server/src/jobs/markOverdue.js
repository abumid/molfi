// Пометка просрочек по рассрочке.
//
// Раз в сутки: платежи со статусом pending, у которых срок прошёл больше чем
// overdue_grace_days назад, становятся overdue. Договор, где накопилось
// default_after_missed просрочек, уходит в defaulted.
//
// Обе настройки читаются из settings, а не из констант: льготный период —
// то, что бизнес меняет чаще всего.

import 'dotenv/config'
import { pool } from '../db/pool.js'
import { getSettingInt } from '../utils/settings.js'

export const markOverdue = async ({ log = console.log } = {}) => {
  const graceDays = await getSettingInt('overdue_grace_days')
  const maxMissed = await getSettingInt('default_after_missed')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Просроченные платежи. waived и paid не трогаем.
    const overdue = (await client.query(
      `UPDATE payment_schedule
       SET status = 'overdue'
       WHERE status = 'pending'
         AND due_date < (CURRENT_DATE - ($1 || ' days')::interval)
       RETURNING id, contract_id, seq, due_date`,
      [String(graceDays)]
    )).rows

    // Договоры, где просрочек накопилось сверх допустимого.
    // Считаем по всем overdue, а не только по свежим: договор мог набрать
    // лимит за несколько прогонов.
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

    log(`[markOverdue] grace ${graceDays} дн., порог ${maxMissed}: просрочено ${overdue.length}, договоров в defaulted ${defaulted.length}`)
    return { graceDays, maxMissed, overdue: overdue.length, defaulted: defaulted.length, overdueRows: overdue, defaultedRows: defaulted }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// Ручной запуск: npm run job:overdue
if (import.meta.url === `file://${process.argv[1]}`) {
  await markOverdue()
  process.exit(0)
}
