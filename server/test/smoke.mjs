import 'dotenv/config'
import { getSetting, getSettingInt, invalidateSettings, boardingFeeMonthly, feeRates, enabledModels } from '../src/utils/settings.js'
import {
  buildSchedule, purchaseFee, purchaseTotal, boardingMonthsDue, boardingDue,
  boardingOutstanding, projectedRevenue, investmentPayout, ownershipSummary, addMonths,
} from '../src/utils/calculations.js'

let pass=0, fail=0
const ok=(c,l,e='')=>{c?pass++:fail++;console.log(`${c?'ok  ':'FAIL'} ${l}${e?'  '+e:''}`)}
const sum=t=>(t/100).toLocaleString('ru-RU')+' сум'
const ago=n=>{const d=new Date();d.setMonth(d.getMonth()-n);return d.toISOString().slice(0,10)}

// ── настройки ──
ok(await boardingFeeMonthly()===4_000_000,'абонплата 40 000 сум/мес', sum(await boardingFeeMonthly()))
const r = await feeRates()
ok(r.purchaseFeeBp===0,'комиссия при покупке выключена', String(r.purchaseFeeBp))
ok(r.profitFeeClientBp===0 && r.profitFeeFarmBp===0,'комиссии с прибыли выключены')
const models = await enabledModels()
ok(models.includes('investment') && models.includes('ownership'),'открыты investment и ownership', models.join(', '))
ok(!models.includes('installment'),'рассрочка спрятана')
ok(await getSetting('platform_fee_bp')===null,'старая настройка platform_fee_bp убрана')
invalidateSettings()
ok(await getSettingInt('overdue_grace_days')===5,'кэш перечитывается после сброса')

// ── комиссия покупки ──
ok(purchaseFee(100_000_000,0)===0,'при нулевой ставке комиссии нет')
ok(purchaseTotal(100_000_000,0)===100_000_000,'списывается ровно цена')
ok(purchaseFee(100_000_000,300)===3_000_000,'при 3% комиссия считается верно', sum(purchaseFee(100_000_000,300)))

// ── абонплата ──
ok(boardingMonthsDue(ago(3))===3,'за 3 месяца начислено 3 месяца')
ok(boardingMonthsDue(ago(0))===0,'в первый месяц платить не за что')
const c8={starts_at:ago(8),boarding_fee_monthly_tiyin:4_000_000}
ok(boardingDue(c8)===32_000_000,'8 месяцев × 40 000 = 320 000 сум', sum(boardingDue(c8)))
ok(boardingOutstanding({boarding_accrued_tiyin:32_000_000,boarding_paid_tiyin:12_000_000})===20_000_000,'остаток долга считается')
ok(boardingOutstanding({boarding_accrued_tiyin:1000,boarding_paid_tiyin:5000})===0,'переплата не даёт отрицательный долг')

// ── investment ──
const animal={current_weight_g:60_000,price_per_kg_tiyin:2_500_000}
ok(projectedRevenue(animal)===150_000_000,'прогноз 60 кг × 25 000 = 1 500 000 сум', sum(projectedRevenue(animal)))

const inv={principal_tiyin:100_000_000,starts_at:ago(8),boarding_fee_monthly_tiyin:4_000_000,boarding_accrued_tiyin:0}
const p=investmentPayout(inv,animal,{profitFeeClientBp:0,profitFeeFarmBp:0})
ok(p.gross===150_000_000,'выручка 1 500 000 сум')
ok(p.boarding===32_000_000,'содержание 320 000 сум', sum(p.boarding))
ok(p.profit===18_000_000,'прибыль 180 000 сум', sum(p.profit))
ok(p.fee_client===0,'комиссии нет, пока ставка нулевая')
ok(p.net===118_000_000,'клиенту 1 180 000 сум', sum(p.net))
ok(Math.abs(p.return_pct-0.18)<0.001,'доходность 18% за 8 мес.', (p.return_pct*100).toFixed(1)+'%')

const pf=investmentPayout(inv,animal,{profitFeeClientBp:500,profitFeeFarmBp:500})
ok(pf.fee_client===900_000,'при 5% комиссия клиента 9 000 сум', sum(pf.fee_client))
ok(pf.fee_farm===900_000,'ферма платит столько же')
ok(pf.net===117_100_000,'клиенту на 9 000 меньше', sum(pf.net))

const loss=investmentPayout({...inv,principal_tiyin:200_000_000},animal,{profitFeeClientBp:500,profitFeeFarmBp:500})
ok(loss.profit===0,'при убытке прибыль ноль')
ok(loss.fee_client===0,'при убытке комиссия не берётся')
ok(loss.net===118_000_000,'клиент получает выручку минус содержание', sum(loss.net))

const tiny=investmentPayout({...inv,starts_at:ago(40)},{current_weight_g:5_000,price_per_kg_tiyin:1_000_000},{})
ok(tiny.net===0,'выплата не уходит в минус', String(tiny.net))
ok(tiny.shortfall>0,'недостача показана отдельно', sum(tiny.shortfall))

// ── ownership ──
const own=ownershipSummary({principal_tiyin:100_000_000,starts_at:ago(5),boarding_fee_monthly_tiyin:4_000_000,boarding_accrued_tiyin:20_000_000,boarding_paid_tiyin:8_000_000})
ok(own.months===5,'5 месяцев владения')
ok(own.outstanding===12_000_000,'к доплате 120 000 сум', sum(own.outstanding))
ok(own.total_cost===120_000_000,'всего потрачено 1 200 000 сум', sum(own.total_cost))

// ── график рассрочки ──
for (const [total,months] of [[100_000_000,6],[100_000_000,7],[123_456_789,12],[1,3]]) {
  const s=buildSchedule(total,months)
  ok(s.reduce((a,p)=>a+p.amount_tiyin,0)===total,`график ${months} мес. сходится до тийина`)
}
ok(buildSchedule(1000,0).length===0,'нулевой срок не ломает график')

console.log(`\n${pass} ok, ${fail} failed`)
process.exit(fail?1:0)
