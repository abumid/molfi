import 'dotenv/config'
import { getSetting, getSettingInt, invalidateSettings, platformFeeBp } from '../src/utils/settings.js'
import { buildSchedule, accrueInterest, ownershipPayout, fixedIncomeMaturity } from '../src/utils/calculations.js'

const ok = (cond, label, extra = '') =>
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? '  ' + extra : ''}`)

// ── settings ──────────────────────────────────────────────
const fee = await platformFeeBp()
ok(fee === 300, 'platform_fee_bp = 300', `получено ${fee}`)

const grace = await getSettingInt('overdue_grace_days')
ok(grace === 5, 'overdue_grace_days = 5', `получено ${grace}`)

const missing = await getSetting('no_such_key_at_all')
ok(missing === null, 'несуществующий ключ → null', `получено ${missing}`)

// кэш: второй вызов не должен идти в базу
const t0 = Date.now()
for (let i = 0; i < 500; i++) await platformFeeBp()
ok(Date.now() - t0 < 100, '500 чтений из кэша быстрее 100 мс', `${Date.now() - t0} мс`)

invalidateSettings()
ok(await platformFeeBp() === 300, 'после invalidateSettings значение перечитано')

// ── график рассрочки ──────────────────────────────────────
// Главное свойство: сумма графика ровно равна цене, до тийина.
for (const [total, months] of [[100000000, 6], [100000000, 7], [123456789, 12], [1, 3]]) {
  const sch = buildSchedule(total, months)
  const sum = sch.reduce((s, p) => s + p.amount_tiyin, 0)
  ok(sum === total, `график ${months} мес. сходится с ${total}`, `сумма ${sum}`)
  ok(sch.length === months, `  платежей ровно ${months}`)
}

// ── fixed_income ──────────────────────────────────────────
// 2 млн сум под 18% → за месяц 30 000 сум (3 000 000 тийин)
const monthly = accrueInterest(200000000, 1800, 365 / 12)
ok(monthly === 3000000, '2 млн сум под 18%: за месяц 30 000 сум', `${monthly / 100} сум`)

const mat = fixedIncomeMaturity({ principal_tiyin: 200000000, annual_rate_bp: 1800, term_months: 12 })
ok(mat.interest === 36000000, 'за 12 мес. начислено 360 000 сум', `${mat.interest / 100} сум`)
ok(mat.total === 236000000, 'итого к погашению 2 360 000 сум')

// ── ownership: комиссия только с прибыли ──────────────────
const animal = { final_sale_price_tiyin: 500000000, current_weight_g: 0, price_per_kg_tiyin: 0 }
const profitCase = ownershipPayout({ principal_tiyin: 400000000 }, animal, fee)
ok(profitCase.profit === 100000000, 'прибыль 1 млн сум посчитана')
ok(profitCase.fee === 3000000, 'комиссия 3% от прибыли = 30 000 сум', `${profitCase.fee / 100} сум`)

const lossCase = ownershipPayout({ principal_tiyin: 600000000 }, animal, fee)
ok(lossCase.profit === 0, 'при убытке прибыль = 0')
ok(lossCase.fee === 0, 'при убытке комиссия не берётся', `${lossCase.fee}`)
ok(lossCase.net === 500000000, 'владелец получает всю выручку без вычетов')

process.exit(0)
