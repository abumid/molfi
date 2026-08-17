// Демо-витрина: 12 офферов с историей веса и лентой ухода.
//
// Скрипт идемпотентный и безопасный: всё, что он создаёт, помечено
// RFID-меткой DEMO-*, и при повторном запуске сносится только это.
// Настоящие животные, договоры и пользователи не трогаются никогда.
//
//   node src/db/seed.demo.js          — залить/пересоздать демо
//   node src/db/seed.demo.js --clean  — снести демо и выйти
//
// Старый seed.js остался от v1 и работать не будет — не запускайте его.

import 'dotenv/config'
import { pool } from './pool.js'

const MARK = 'DEMO-'
const SUM = 100                     // 1 сум = 100 тийин
const sum = (n) => n * SUM
const kg = (n) => Math.round(n * 1000)

// Фото демо-животным не ставим: без него карточка показывает эмодзи,
// и это выглядит опрятнее нарисованного силуэта. Появятся настоящие
// снимки — просто заполните photo_url через админку.

// ── исходные данные ───────────────────────────────────────

const FARMS = [
  // Без «·» в названии: этим же символом склеиваются части подписи
  // на карточке, и внутри имени он читается как разделитель
  { name: 'Молфи Чирчик',  location: 'Ташкентская область' },
  { name: 'Молфи Паркент', location: 'Ташкентская область' },
]

// Породы, которые реально разводят в Узбекистане
const BREEDS = [
  { ru: 'Гиссарская',    en: 'Hissar',      uz: 'Hisor' },
  { ru: 'Джайдара',      en: 'Jaydara',     uz: 'Jaydara' },
  { ru: 'Каракульская',  en: 'Karakul',     uz: 'Qorako\'l' },
  { ru: 'Эдильбаевская', en: 'Edilbay',     uz: 'Edilboy' },
]

const NAMES = [
  'Бахром', 'Тулпар', 'Алпамыш', 'Батыр', 'Гулзор', 'Шердор',
  'Кумуш', 'Нодир', 'Улугбек', 'Явуз', 'Зафар', 'Санжар',
]

/** Цена живого веса. Ниже мясной: покупатель берёт животное, а не тушу. */
const PRICE_PER_KG = sum(65_000)
const BOARDING = sum(40_000)

const pick = (arr, i) => arr[i % arr.length]

/**
 * Псевдослучайность с фиксированным зерном: повторный запуск даёт
 * ту же витрину. Иначе каждый прогон менял бы цены, и невозможно
 * было бы понять, где баг вёрстки, а где просто другие данные.
 */
let seed = 20260817
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const between = (a, b) => a + rnd() * (b - a)

const ACTS = [
  { type: 'feeding',  ru: 'Кормление',        en: 'Feeding',        uz: 'Yemlash',
    dru: 'Люцерна, ячмень, минеральная подкормка', den: 'Alfalfa, barley, mineral supplement', duz: 'Beda, arpa, mineral qo\'shimcha' },
  { type: 'weighing', ru: 'Контрольное взвешивание', en: 'Control weigh-in', uz: 'Nazorat tortish',
    dru: 'Плановый замер, прибавка в норме', den: 'Scheduled measurement, gain on track', duz: 'Rejali o\'lchov, o\'sish me\'yorda' },
  { type: 'vet',      ru: 'Осмотр ветеринара', en: 'Vet check',      uz: 'Veterinar ko\'rigi',
    dru: 'Общее состояние в норме, вакцинация по графику', den: 'General condition normal, vaccination on schedule', duz: 'Umumiy holat me\'yorda, emlash jadval bo\'yicha' },
  { type: 'video',    ru: 'Видео с фермы',     en: 'Video from the farm', uz: 'Fermadan video',
    dru: 'Съёмка на выгуле', den: 'Filmed at pasture', duz: 'Yaylovda suratga olindi' },
]

const daysAgo = (n) => new Date(Date.now() - n * 864e5)

// ── работа с базой ────────────────────────────────────────

/** Сносит только демо-строки. Опознаём их по RFID-метке. */
async function clean(client) {
  const { rows } = await client.query(
    `SELECT id FROM animals WHERE rfid_tag LIKE $1`, [MARK + '%'])
  const ids = rows.map(r => r.id)
  if (!ids.length) return 0

  const used = (await client.query(
    `SELECT count(*)::int AS n FROM contracts WHERE animal_id = ANY($1)`, [ids])).rows[0].n
  if (used > 0) {
    throw new Error(
      `по демо-животным есть ${used} договор(ов). Удалите их через админку, ` +
      `иначе снос демо утащит за собой историю продаж.`)
  }

  await client.query(`DELETE FROM products WHERE animal_id = ANY($1)`, [ids])
  // weight_records, activity и videos уходят каскадом по FK
  await client.query(`DELETE FROM animals WHERE id = ANY($1)`, [ids])
  await client.query(`DELETE FROM farms WHERE name LIKE 'Молфи %'
                        AND NOT EXISTS (SELECT 1 FROM animals a WHERE a.farm_id = farms.id)`)
  return ids.length
}

async function seedDemo(client) {
  const farmIds = []
  for (const f of FARMS) {
    const existing = (await client.query(`SELECT id FROM farms WHERE name = $1`, [f.name])).rows[0]
    farmIds.push(existing
      ? existing.id
      : (await client.query(
          `INSERT INTO farms (name, location, description) VALUES ($1,$2,$3) RETURNING id`,
          [f.name, f.location, 'Демонстрационная ферма Molfi']
        )).rows[0].id)
  }

  const made = []

  for (let i = 0; i < 12; i++) {
    // Первые шесть — инвестиция, остальные — владение
    const model = i < 6 ? 'investment' : 'ownership'
    const breed = pick(BREEDS, i)
    const name = NAMES[i]
    const farmId = farmIds[i % farmIds.length]

    const ageM = Math.round(between(5, 16))
    const birth = new Date()
    birth.setMonth(birth.getMonth() - ageM)

    const startKg = between(24, 34)          // вес полгода назад
    const nowKg = startKg + between(9, 22)   // сколько набрал

    const animal = (await client.query(
      `INSERT INTO animals
         (farm_id, name, species, breed, sex, birth_date, current_weight_g,
          price_per_kg_tiyin, acquired_cost_tiyin, rfid_tag, description, photo_url,
          status, expected_sale_date)
       VALUES ($1,$2,'sheep',$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12)
       RETURNING *`,
      [
        farmId, name, breed.ru, i % 3 === 0 ? 'female' : 'male',
        birth.toISOString().slice(0, 10), kg(nowKg),
        PRICE_PER_KG, Math.round(kg(startKg) / 1000 * PRICE_PER_KG),
        `${MARK}${String(i + 1).padStart(4, '0')}`,
        `${breed.ru} порода, выращивается на ферме «${FARMS[i % FARMS.length].name}». ` +
        `Пастбищное содержание, ветеринарный контроль каждые две недели.`,
        null,
        new Date(Date.now() + between(60, 200) * 864e5).toISOString().slice(0, 10),
      ]
    )).rows[0]

    // История веса: 6 замеров за полгода, монотонный рост.
    // Без неё график на карточке пустой, а он половина ценности экрана.
    const points = 6
    for (let p = 0; p < points; p++) {
      const t = p / (points - 1)
      const w = startKg + (nowKg - startKg) * t
      await client.query(
        `INSERT INTO weight_records (animal_id, weight_g, recorded_at) VALUES ($1,$2,$3)`,
        [animal.id, kg(w), daysAgo(Math.round(180 - 180 * t))]
      )
    }

    // Лента ухода за последние два месяца
    for (let a = 0; a < 5; a++) {
      const act = pick(ACTS, i + a)
      await client.query(
        `INSERT INTO activity
           (animal_id, type, title_ru, title_en, title_uz,
            description_ru, description_en, description_uz, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [animal.id, act.type, act.ru, act.en, act.uz,
         act.dru, act.den, act.duz, daysAgo(Math.round(between(1, 60)))]
      )
    }

    // Цена = вес × цена за кг, округлённая до десяти тысяч сум:
    // в прайсе не бывает «3 386 500», бывает «3 390 000»
    const ROUND = sum(10_000)
    const price = Math.round(nowKg * PRICE_PER_KG / ROUND) * ROUND

    const product = (await client.query(
      `INSERT INTO products
         (model_type, animal_id, farm_id,
          title_ru, title_en, title_uz,
          description_ru, description_en, description_uz, photo_url,
          price_tiyin, boarding_fee_monthly_tiyin, slots_total, slots_taken, status, starts_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,0,'active',CURRENT_DATE)
       RETURNING *`,
      [
        model, animal.id, farmId,
        `${name} · ${breed.ru}`, `${name} · ${breed.en}`, `${name} · ${breed.uz}`,
        model === 'investment'
          ? 'Покупаете барана, ферма растит и содержит. Продать решаете вы — по рекомендации фермера или когда захотите. Из выручки вычитается плата за содержание.'
          : 'Покупаете барана и платите абонентскую плату за уход. В конце забираете живым или мясом — решаете сами.',
        model === 'investment'
          ? 'You buy the ram, the farm raises and cares for it. You decide when to sell. The cost of care is deducted from the proceeds.'
          : 'You buy the ram and pay a monthly care fee. At the end you take it live or as meat — your call.',
        model === 'investment'
          ? 'Qo\'chqorni sotib olasiz, ferma boqadi. Qachon sotishni o\'zingiz hal qilasiz. Parvarish haqi tushumdan ushlab qolinadi.'
          : 'Qo\'chqorni sotib olasiz va parvarish uchun oylik to\'lov to\'laysiz. Oxirida tirik yoki go\'sht sifatida olasiz.',
        null,
        price, BOARDING,
      ]
    )).rows[0]

    made.push({ model, name: `${name} · ${breed.ru}`,
                kg: nowKg.toFixed(1), price: price / SUM, product: product.id })
  }

  return made
}

// ── запуск ────────────────────────────────────────────────

const cleanOnly = process.argv.includes('--clean')
const client = await pool.connect()

try {
  await client.query('BEGIN')

  const removed = await clean(client)
  if (removed) console.log(`снесено демо-животных: ${removed}`)

  if (cleanOnly) {
    await client.query('COMMIT')
    console.log('демо удалено')
  } else {
    const made = await seedDemo(client)
    await client.query('COMMIT')

    console.log('\nоффер  модель       животное                вес      цена')
    console.log('─'.repeat(64))
    for (const m of made) {
      console.log(
        `#${String(m.product).padEnd(5)} ${m.model.padEnd(12)} ${m.name.padEnd(23)} ` +
        `${m.kg.padStart(5)} кг ${m.price.toLocaleString('ru-RU').padStart(11)} сум`
      )
    }
    console.log(`\nсоздано ${made.length} офферов, у каждого 6 замеров веса и 5 записей в ленте`)
    console.log('абонплата 40 000 сум/мес, цена живого веса 65 000 сум/кг')
    console.log('\nснести обратно:  node src/db/seed.demo.js --clean')
  }
} catch (e) {
  await client.query('ROLLBACK')
  console.error('\nне удалось:', e.message)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
