import 'dotenv/config'
import { getSetting, getSettingInt, invalidateSettings, boardingFeeMonthly, feeRates, enabledModels } from '../src/utils/settings.js'
import {
  buildSchedule, purchaseFee, purchaseTotal, boardingMonthsDue, boardingDue,
  boardingOutstanding, projectedRevenue, investmentPayout, ownershipSummary, addMonths,
} from '../src/utils/calculations.js'

let pass=0, fail=0
const ok=(c,l,e='')=>{c?pass++:fail++;console.log(`${c?'ok  ':'FAIL'} ${l}${e?'  '+e:''}`)}
const sum=t=>(t/100).toLocaleString('en-US')+' sum'
const ago=n=>{const d=new Date();d.setMonth(d.getMonth()-n);return d.toISOString().slice(0,10)}

// ── settings ──
ok(await boardingFeeMonthly()===4_000_000,'boarding fee 40,000 sum/month', sum(await boardingFeeMonthly()))
const r = await feeRates()
ok(r.purchaseFeeBp===0,'purchase fee switched off', String(r.purchaseFeeBp))
ok(r.profitFeeClientBp===0 && r.profitFeeFarmBp===0,'profit fees switched off')
const models = await enabledModels()
ok(models.includes('investment') && models.includes('ownership'),'investment and ownership are open', models.join(', '))
ok(!models.includes('installment'),'instalments are hidden')
ok(await getSetting('platform_fee_bp')===null,'the old platform_fee_bp setting is gone')
invalidateSettings()
ok(await getSettingInt('overdue_grace_days')===5,'the cache is re-read after a reset')

// ── purchase fee ──
ok(purchaseFee(100_000_000,0)===0,'no fee at a zero rate')
ok(purchaseTotal(100_000_000,0)===100_000_000,'exactly the price is charged')
ok(purchaseFee(100_000_000,300)===3_000_000,'at 3% the fee is computed correctly', sum(purchaseFee(100_000_000,300)))

// ── boarding fee ──
ok(boardingMonthsDue(ago(3))===3,'3 months elapsed means 3 months accrued')
ok(boardingMonthsDue(ago(0))===0,'nothing to pay in the first month')
const c8={starts_at:ago(8),boarding_fee_monthly_tiyin:4_000_000}
ok(boardingDue(c8)===32_000_000,'8 months × 40,000 = 320,000 sum', sum(boardingDue(c8)))
ok(boardingOutstanding({boarding_accrued_tiyin:32_000_000,boarding_paid_tiyin:12_000_000})===20_000_000,'the outstanding debt is computed')
ok(boardingOutstanding({boarding_accrued_tiyin:1000,boarding_paid_tiyin:5000})===0,'an overpayment does not make the debt negative')

// ── investment ──
const animal={current_weight_g:60_000,price_per_kg_tiyin:2_500_000}
ok(projectedRevenue(animal)===150_000_000,'projection 60 kg × 25,000 = 1,500,000 sum', sum(projectedRevenue(animal)))

const inv={principal_tiyin:100_000_000,starts_at:ago(8),boarding_fee_monthly_tiyin:4_000_000,boarding_accrued_tiyin:0}
const p=investmentPayout(inv,animal,{profitFeeClientBp:0,profitFeeFarmBp:0})
ok(p.gross===150_000_000,'revenue 1,500,000 sum')
ok(p.boarding===32_000_000,'boarding 320,000 sum', sum(p.boarding))
ok(p.profit===18_000_000,'profit 180,000 sum', sum(p.profit))
ok(p.fee_client===0,'no fee while the rate is zero')
ok(p.net===118_000_000,'client gets 1,180,000 sum', sum(p.net))
ok(Math.abs(p.return_pct-0.18)<0.001,'return 18% over 8 months', (p.return_pct*100).toFixed(1)+'%')

const pf=investmentPayout(inv,animal,{profitFeeClientBp:500,profitFeeFarmBp:500})
ok(pf.fee_client===900_000,'at 5% the client fee is 9,000 sum', sum(pf.fee_client))
ok(pf.fee_farm===900_000,'the farm pays the same')
ok(pf.net===117_100_000,'the client gets 9,000 less', sum(pf.net))

const loss=investmentPayout({...inv,principal_tiyin:200_000_000},animal,{profitFeeClientBp:500,profitFeeFarmBp:500})
ok(loss.profit===0,'profit is zero on a loss')
ok(loss.fee_client===0,'no fee is charged on a loss')
ok(loss.net===118_000_000,'the client gets revenue minus boarding', sum(loss.net))

const tiny=investmentPayout({...inv,starts_at:ago(40)},{current_weight_g:5_000,price_per_kg_tiyin:1_000_000},{})
ok(tiny.net===0,'the payout never goes negative', String(tiny.net))
ok(tiny.shortfall>0,'the shortfall is shown separately', sum(tiny.shortfall))

// ── ownership ──
const own=ownershipSummary({principal_tiyin:100_000_000,starts_at:ago(5),boarding_fee_monthly_tiyin:4_000_000,boarding_accrued_tiyin:20_000_000,boarding_paid_tiyin:8_000_000})
ok(own.months===5,'5 months of ownership')
ok(own.outstanding===12_000_000,'120,000 sum still to pay', sum(own.outstanding))
ok(own.total_cost===120_000_000,'1,200,000 sum spent in total', sum(own.total_cost))

// ── instalment schedule ──
for (const [total,months] of [[100_000_000,6],[100_000_000,7],[123_456_789,12],[1,3]]) {
  const s=buildSchedule(total,months)
  ok(s.reduce((a,p)=>a+p.amount_tiyin,0)===total,`a ${months}-month schedule adds up to the tiyin`)
}
ok(buildSchedule(1000,0).length===0,'a zero term does not break the schedule')

console.log(`\n${pass} ok, ${fail} failed`)
process.exit(fail?1:0)
