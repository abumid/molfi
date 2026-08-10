import { pool } from './pool.js'
import bcrypt from 'bcryptjs'

const seed = async () => {
  await pool.query(`INSERT INTO farms (name, location, description) VALUES ('Ферма Ташкент', 'Ташкентская область, Узбекистан', 'Экологически чистая ферма') ON CONFLICT DO NOTHING`)

  const farm = await pool.query(`SELECT id FROM farms LIMIT 1`)
  const farmId = farm.rows[0].id

  const sheepData = [
    ['Барашек №1', 'Каракуль', 45000, 15000000, 'RFID-001'],
    ['Барашек №2', 'Романовская', 52000, 18000000, 'RFID-002'],
    ['Барашек №3', 'Гиссарская', 68000, 25000000, 'RFID-003'],
    ['Барашек №4', 'Каракуль', 41000, 14000000, 'RFID-004'],
    ['Барашек №5', 'Эдильбаевская', 55000, 19000000, 'RFID-005'],
  ]

  for (const [name, breed, weight, price, rfid] of sheepData) {
    await pool.query(
      `INSERT INTO sheep (farm_id, name, breed, current_weight_g, price_tiyin, rfid_tag, sold_shares)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [farmId, name, breed, weight, price, rfid, Math.floor(Math.random() * 60)]
    )
  }

  const hash = await bcrypt.hash('admin123', 10)
  await pool.query(
    `INSERT INTO users (phone, name, password_hash, role, referral_code)
     VALUES ('+998901234567', 'Admin', $1, 'admin', 'ADMIN001') ON CONFLICT DO NOTHING`,
    [hash]
  )

  // Activity seeding — delete existing then re-insert
  await pool.query(`DELETE FROM activity`)

  const sheepRows = (await pool.query(`SELECT id FROM sheep ORDER BY id LIMIT 3`)).rows
  if (sheepRows.length > 0) {
    const activitySets = sheepRows.map((row, idx) => {
      const sid = row.id
      const wkg = [40.0, 52.0, 68.0][idx]
      const dkg = [2.3, 1.8, 3.1][idx]
      return [
        [sid, 'feeding',  'Кормление',         'Oziqlantirish',     'Утренний рацион выдан',         'Ertalabki oziq berildi',     null,                                                                         '2 hours'],
        [sid, 'video',    'Видео с фермы',      'Ferma videosi',     'Фермер загрузил новое видео',   'Fermer yangi video yukladi', `{"duration":"0:42","location_ru":"Ферма Ташкент","location_uz":"Toshkent fermasi","url":null}`, '1 day'],
        [sid, 'weighing', 'Взвешивание',        "Og'irlash",         'Контрольное измерение',         "Nazorat o'lchovi",           `{"weight_kg":${wkg},"delta_kg":${dkg}}`,                                     '1 day 3 hours'],
        [sid, 'vet',      'Осмотр ветеринара',  "Veterinar ko'rigi", 'Плановая проверка здоровья',    'Rejalashtirilgan tekshiruv', `{"result_ru":"Здоров","result_uz":"Sog'lom"}`,                                '3 days'],
        [sid, 'feeding',  'Кормление',         'Oziqlantirish',     'Вечерний рацион выдан',         'Kechki oziq berildi',        null,                                                                         '3 days 6 hours'],
        [sid, 'video',    'Видео с фермы',      'Ferma videosi',     'Фермер загрузил видео',         'Fermer video yukladi',       `{"duration":"1:15","location_ru":"Ферма Ташкент","location_uz":"Toshkent fermasi","url":null}`, '5 days'],
      ]
    })

    for (const events of activitySets) {
      for (const [sid, type, tru, tuz, dru, duz, meta, interval] of events) {
        await pool.query(
          `INSERT INTO activity (sheep_id, type, title_ru, title_uz, description_ru, description_uz, meta, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, NOW() - INTERVAL '${interval}')`,
          [sid, type, tru, tuz, dru, duz, meta]
        )
      }
    }
  }

  console.log('Seed complete')
  process.exit(0)
}

seed().catch(e => { console.error(e); process.exit(1) })
