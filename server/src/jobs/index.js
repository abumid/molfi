// Scheduler. We do not pull in node-cron — there are enough dependencies
// already, and setInterval is plenty for two daily jobs.

import { accrueBoarding } from './accrueBoarding.js'
import { markOverdue } from './markOverdue.js'

const DAY_MS = 24 * 60 * 60 * 1000

// The first run is delayed: let the server come up without competing with it.
const FIRST_RUN_DELAY_MS = 30 * 1000

/**
 * A wrapper with two guarantees:
 *  • a job never starts on top of a previous run that is still going
 *  • a failed job neither kills the process nor cancels later runs
 */
const guarded = (name, fn) => {
  let running = false
  return async () => {
    if (running) {
      console.warn(`[jobs] ${name} is still running, run skipped`)
      return
    }
    running = true
    try {
      await fn()
    } catch (e) {
      console.error(`[jobs] ${name} failed:`, e.message)
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
    // Do not keep the process alive just for the timer
    timer.unref?.()
    console.log(`[jobs] ${name} scheduled once a day`)
  }
}
