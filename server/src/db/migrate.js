import { pool } from './pool.js'

const migrate = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(100),
      password_hash VARCHAR(255),
      role VARCHAR(20) DEFAULT 'user',
      referral_code VARCHAR(20) UNIQUE,
      balance BIGINT DEFAULT 0,
      telegram_id BIGINT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS balance BIGINT DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id BIGINT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(2) DEFAULT 'ru';
    CREATE INDEX IF NOT EXISTS users_telegram_id_idx ON users (telegram_id);
    CREATE INDEX IF NOT EXISTS sms_codes_phone_idx ON sms_codes (phone);

    CREATE TABLE IF NOT EXISTS sms_codes (
      id SERIAL PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS farms (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      location VARCHAR(200),
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sheep (
      id SERIAL PRIMARY KEY,
      farm_id INTEGER REFERENCES farms(id),
      name VARCHAR(100) NOT NULL,
      breed VARCHAR(100),
      birth_date DATE,
      current_weight_g INTEGER DEFAULT 0,
      price_tiyin BIGINT DEFAULT 0,
      total_shares INTEGER DEFAULT 100,
      sold_shares INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'active',
      rfid_tag VARCHAR(50),
      description TEXT,
      photo_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE sheep ADD COLUMN IF NOT EXISTS price_per_kg_tiyin BIGINT;
    ALTER TABLE sheep ADD COLUMN IF NOT EXISTS final_weight_g INTEGER;
    ALTER TABLE sheep ADD COLUMN IF NOT EXISTS final_sale_price_tiyin BIGINT;
    ALTER TABLE sheep ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP;
    ALTER TABLE sheep ADD COLUMN IF NOT EXISTS expected_sale_date DATE;
    ALTER TABLE sheep ADD COLUMN IF NOT EXISTS last_video_at TIMESTAMP;
    ALTER TABLE sheep ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMP;

    CREATE TABLE IF NOT EXISTS weight_records (
      id SERIAL PRIMARY KEY,
      sheep_id INTEGER REFERENCES sheep(id),
      weight_g INTEGER NOT NULL,
      recorded_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS shares (
      id SERIAL PRIMARY KEY,
      sheep_id INTEGER REFERENCES sheep(id),
      user_id INTEGER REFERENCES users(id),
      share_pct INTEGER NOT NULL,
      purchase_price_tiyin BIGINT NOT NULL,
      purchased_at TIMESTAMP DEFAULT NOW(),
      status VARCHAR(20) DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS wallet_balances (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      balance_tiyin BIGINT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      type VARCHAR(30) NOT NULL,
      amount_tiyin BIGINT NOT NULL,
      description VARCHAR(300),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      sheep_id INTEGER REFERENCES sheep(id),
      url VARCHAR(500),
      thumbnail_url VARCHAR(500),
      recorded_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activity (
      id SERIAL PRIMARY KEY,
      sheep_id INTEGER REFERENCES sheep(id),
      type VARCHAR(50),
      description VARCHAR(300),
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE activity ADD COLUMN IF NOT EXISTS title_ru VARCHAR(100);
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS title_uz VARCHAR(100);
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS description_ru TEXT;
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS description_uz TEXT;
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS meta JSONB;
    ALTER TABLE activity ALTER COLUMN type TYPE VARCHAR(20);

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'activity_type_check'
      ) THEN
        ALTER TABLE activity ADD CONSTRAINT activity_type_check
          CHECK (type IN ('feeding','weighing','vet','video'));
      END IF;
    END $$;
  `)
  console.log('Migration complete')
  process.exit(0)
}

migrate().catch(e => { console.error(e); process.exit(1) })
