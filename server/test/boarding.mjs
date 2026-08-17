// Цикл абонплаты: начисление → оплата → продажа.
// Требует запущенного сервера.

import 'dotenv/config'
import jwt from 'jsonwebtoken'
import { pool } from '../src/db/pool.js'
import { accrueBoarding } from '../src/jobs/accrueBoarding.js'

const API = `http://localhost:${process.env.PORT || 3000}/api`
let pass=0, fail=0
const ok=(c,l,e='')=>{c?pass++:fail++;console.log(`${c?'ok  ':'FAIL'} ${l}${e?'  → '+e:''}`)}
const sum=t=>(t/100).toLocaleString('ru-RU')+' сум'

try { await fetch(API + '/models') } catch {
  console.error('Сервер не отвечает. Запустите: cd server && npm run dev'); process.exit(1)
}

const call = async (m,p,{token,body}={}) => {
  const r = await fetch(API+p,{method:m,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})})
  let j=null; try{j=await r.json()}catch{}
  return {status:r.status,...j}
}
const sign = u => jwt.sign({id:u.id,phone:u.phone,role:u.role}, process.env.JWT_SECRET, {expiresIn:'1h'})

const admin = (await pool.query(`SELECT id,phone,role FROM users WHERE role='admin' LIMIT 1`)).rows[0]
if (!admin) { console.error('Нет админа'); process.exit(1) }
const adminToken = sign(admin)

// уборка прошлого прогона
const PHONE='+998900000999'
const prev=(await pool.query(`SELECT id FROM users WHERE phone=$1`,[PHONE])).rows[0]
if (prev) {
  await pool.query(`UPDATE animals SET status='active' WHERE id IN (SELECT animal_id FROM contracts WHERE user_id=$1 AND animal_id IS NOT NULL)`,[prev.id])
  await pool.query(`DELETE FROM transactions WHERE user_id=$1`,[prev.id])
  await pool.query(`DELETE FROM contracts WHERE user_id=$1`,[prev.id])
}
await pool.query(`DELETE FROM products WHERE title_en LIKE 'BOARD %'`)

let user = prev || (await pool.query(
  `INSERT INTO users (phone,name,role,referral_code) VALUES ($1,'Boarding Test','user',$2) RETURNING id,phone,role`,
  [PHONE,'BRD'+Date.now().toString(36).slice(-5).toUpperCase()])).rows[0]
if (!user.phone) user = (await pool.query(`SELECT id,phone,role FROM users WHERE id=$1`,[user.id])).rows[0]
await pool.query(`INSERT INTO wallet_balances (user_id,balance_tiyin) VALUES ($1,5000000000)
  ON CONFLICT (user_id) DO UPDATE SET balance_tiyin=5000000000`,[user.id])
const userToken = sign(user)

const animal=(await pool.query(`SELECT id,name FROM animals WHERE status='active'
  AND id NOT IN (SELECT animal_id FROM contracts WHERE animal_id IS NOT NULL AND status IN ('pending','active'))
  ORDER BY id LIMIT 1`)).rows[0]
if (!animal) { console.error('Нет свободного животного'); process.exit(1) }
const farm=(await pool.query(`SELECT id FROM farms ORDER BY id LIMIT 1`)).rows[0]

console.log(`клиент #${user.id}, животное #${animal.id} «${animal.name}»\n`)

// ── владение с абонплатой 40 000 ──
console.log('── начисление ──')
const prod = await call('POST','/admin/products',{token:adminToken,body:{
  model_type:'ownership', animal_id:animal.id, farm_id:farm?.id, title_en:'BOARD ownership',
  price_tiyin:100000000, boarding_fee_monthly_tiyin:4000000, status:'active',
}})
ok(prod.success===true,'оффер владения создан',prod.error)

const c = await call('POST','/admin/contracts',{token:adminToken,body:{user_id:user.id,product_id:prod.product.id}})
ok(c.success===true,'договор оформлен',c.error)
ok(Number(c.contract.boarding_fee_monthly_tiyin)===4000000,'абонплата зафиксирована в договоре')

// сдвигаем начало на 5 месяцев назад
await pool.query(`UPDATE contracts SET starts_at=CURRENT_DATE-INTERVAL '5 months',
  boarding_accrued_until=CURRENT_DATE-INTERVAL '5 months' WHERE id=$1`,[c.contract.id])

const r1 = await accrueBoarding({log:()=>{}})
const after1=(await pool.query(`SELECT * FROM contracts WHERE id=$1`,[c.contract.id])).rows[0]
ok(Number(after1.boarding_accrued_tiyin)===20000000,'за 5 месяцев начислено 200 000 сум',sum(after1.boarding_accrued_tiyin))

const r2 = await accrueBoarding({log:()=>{}})
const after2=(await pool.query(`SELECT boarding_accrued_tiyin FROM contracts WHERE id=$1`,[c.contract.id])).rows[0]
ok(Number(after2.boarding_accrued_tiyin)===20000000,'повторный прогон не задваивает',sum(after2.boarding_accrued_tiyin))
ok(r2.touched===0,'  тронуто 0 договоров')

// ── оплата клиентом с кошелька ──
console.log('\n── оплата ──')
const balBefore=Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`,[user.id])).rows[0].balance_tiyin)
const pay = await call('POST','/payments/boarding',{token:userToken,body:{contract_id:c.contract.id,amount_tiyin:8000000}})
ok(pay.success===true,'частичная оплата 80 000 прошла',pay.error)
ok(pay.outstanding_tiyin===12000000,'остаток 120 000 сум',sum(pay.outstanding_tiyin))
const balAfter=Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`,[user.id])).rows[0].balance_tiyin)
ok(balBefore-balAfter===8000000,'с кошелька списано ровно 80 000',sum(balBefore-balAfter))

// ── админ: наличными, мимо кошелька ──
const balBefore2=balAfter
const cash = await call('POST',`/admin/contracts/${c.contract.id}/boarding`,{token:adminToken,body:{from_wallet:false}})
ok(cash.success===true,'админ записал оплату наличными',cash.error)
ok(cash.outstanding_tiyin===0,'долг закрыт полностью')
const balAfter2=Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`,[user.id])).rows[0].balance_tiyin)
ok(balAfter2===balBefore2,'кошелёк при наличной оплате не тронут',sum(balAfter2))

const again = await call('POST','/payments/boarding',{token:userToken,body:{contract_id:c.contract.id}})
ok(again.success===false,'повторная оплата без долга отклонена',again.error)

// ── продажа по инвестиции: содержание вычитается из выручки ──
console.log('\n── продажа с вычетом содержания ──')
const animal2=(await pool.query(`SELECT id,name FROM animals WHERE status='active'
  AND id NOT IN (SELECT animal_id FROM contracts WHERE animal_id IS NOT NULL AND status IN ('pending','active'))
  ORDER BY id LIMIT 1`)).rows[0]
if (animal2) {
  await pool.query(`UPDATE animals SET current_weight_g=60000, price_per_kg_tiyin=2500000 WHERE id=$1`,[animal2.id])
  const p2 = await call('POST','/admin/products',{token:adminToken,body:{
    model_type:'investment', animal_id:animal2.id, farm_id:farm?.id, title_en:'BOARD investment',
    price_tiyin:100000000, boarding_fee_monthly_tiyin:4000000, status:'active',
  }})
  const c2 = await call('POST','/admin/contracts',{token:adminToken,body:{user_id:user.id,product_id:p2.product.id}})
  ok(c2.success===true,'договор инвестиции оформлен',c2.error)

  await pool.query(`UPDATE contracts SET starts_at=CURRENT_DATE-INTERVAL '8 months',
    boarding_accrued_until=CURRENT_DATE-INTERVAL '8 months' WHERE id=$1`,[c2.contract.id])
  await accrueBoarding({log:()=>{}})

  const balB=Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`,[user.id])).rows[0].balance_tiyin)
  const sell = await call('POST',`/admin/animals/${animal2.id}/sell`,{token:adminToken,body:{final_sale_price_tiyin:150000000}})
  ok(sell.success===true,'продажа прошла',sell.error)
  ok(sell.calc?.boarding===32000000,'из выручки вычтено 320 000 содержания',sum(sell.calc?.boarding))
  ok(sell.calc?.profit===18000000,'прибыль 180 000',sum(sell.calc?.profit))
  ok(sell.calc?.net===118000000,'клиенту 1 180 000',sum(sell.calc?.net))
  const balA=Number((await pool.query(`SELECT balance_tiyin FROM wallet_balances WHERE user_id=$1`,[user.id])).rows[0].balance_tiyin)
  ok(balA-balB===118000000,'на кошелёк пришло ровно столько',sum(balA-balB))
  const closed=(await pool.query(`SELECT status,boarding_paid_tiyin,boarding_accrued_tiyin FROM contracts WHERE id=$1`,[c2.contract.id])).rows[0]
  ok(closed.status==='completed','договор закрыт')
  ok(Number(closed.boarding_paid_tiyin)===Number(closed.boarding_accrued_tiyin),'долг по содержанию погашен продажей')
}

console.log(`\n${pass} ok, ${fail} failed`)
process.exit(fail?1:0)
