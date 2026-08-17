// Планировщик. node-cron не тащим — зависимостей и так хватает,
// а setInterval для двух суточных задач достаточно.

import { accrueBoarding } from './accrueBoarding.js'
import { markOverdue } from './markOverdue.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Первый прогон не сразу: дать серверу подняться и не мешать старту.
const FIRST_RUN_DELAY_MS = 30 * 1000

/**
 * Обёртка с двумя гарантиями:
 *  • задача не запускается поверх ещё не закончившейся предыдущей
 *  • упавшая задача не роняет процесс и не отменяет следующие прогоны
 */
const guarded = (name, fn) => {
  let running = false
  return async () => {
    if (running) {
      console.warn(`[jobs] ${name} ещё выполняется, прогон пропущен`)
      return
    }
    running = true
    try {
      await fn()
    } catch (e) {
      console.error(`[jobs] ${name} упала:`, e.message)
    } finally {
      running = false
    }
  }
}

export const startJobs = () => {
  const tasks = [
    ['accrueBoarding', guarded('accrueBoarding', accrueBoarding)],
    ['markOverdue', guarded('markOverdue', markOverdue)],
  ]

  for (const [name, run] of tasks) {
    setTimeout(run, FIRST_RUN_DELAY_MS)
    const timer = setInterval(run, DAY_MS)
    // Не держим процесс живым только ради таймера
    timer.unref?.()
    console.log(`[jobs] ${name} запланирована раз в сутки`)
  }
}
