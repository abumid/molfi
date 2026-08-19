import { pool } from './pool.js'

// Molfi v2 — migration for the investment / ownership / installment models.
// Idempotent: safe to run on top of an existing v1 database.
// Order: reference tables → rename sheep→animals → sales → indexes → default settings.

const migrate = async () => {
  await pool.query(`
    -- ============================================================
    -- 0. PLATFORM SETTINGS (instead of a hardcoded 10% in the code)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS settings (
      key        VARCHAR(60) PRIMARY KEY,
      value      TEXT NOT NULL,
      comment    TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- ============================================================
    -- 1. USERS (unchanged from v1)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      phone         VARCHAR(20) UNIQUE NOT NULL,
      name          VARCHAR(100),
      password_hash VARCHAR(255),
      role          VARCHAR(20) DEFAULT 'user',
      referral_code VARCHAR(20) UNIQUE,
      balance       BIGINT DEFAULT 0,
      created_at    TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id       BIGINT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name        VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name         VARCHAR(100);
    -- Interface language. Defaults to English; ru/uz are switched manually.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(2) DEFAULT 'en';
    ALTER TABLE users ALTER COLUMN language SET DEFAULT 'en';

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_language_check') THEN
        ALTER TABLE users ADD CONSTRAINT users_language_check
          CHECK (language IN ('en','ru','uz'));
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS sms_codes (
      id         SERIAL PRIMARY KEY,
      phone      VARCHAR(20) NOT NULL,
      code       VARCHAR(10) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used       BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS farms (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      location    VARCHAR(200),
      description TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    -- ============================================================
    -- 2. SHEEP -> ANIMALS
    --    Renamed so cows and goats can be added later.
    --    Postgres carries the foreign keys and indexes over automatically.
    -- ============================================================
    DO $$
    BEGIN
      IF to_regclass('public.sheep') IS NOT NULL
         AND to_regclass('public.animals') IS NULL THEN
        ALTER TABLE sheep RENAME TO animals;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS animals (
      id               SERIAL PRIMARY KEY,
      farm_id          INTEGER REFERENCES farms(id),
      name             VARCHAR(100) NOT NULL,
      breed            VARCHAR(100),
      birth_date       DATE,
      current_weight_g INTEGER DEFAULT 0,
      status           VARCHAR(20) DEFAULT 'active',
      rfid_tag         VARCHAR(50),
      description      TEXT,
      photo_url        VARCHAR(500),
      created_at       TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE animals ADD COLUMN IF NOT EXISTS species            VARCHAR(20) DEFAULT 'sheep';
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS sex                VARCHAR(10);
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS price_per_kg_tiyin BIGINT;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS acquired_cost_tiyin BIGINT;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS final_weight_g     INTEGER;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS final_sale_price_tiyin BIGINT;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS sold_at            TIMESTAMP;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS expected_sale_date DATE;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS last_video_at      TIMESTAMP;
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS last_scan_at       TIMESTAMP;

    -- VARCHAR(500) is too short: signed S3 and Cloudinary links are regularly
    -- longer, and the image would be silently truncated on insert. varchar -> text
    -- is binary compatible in Postgres, so the table is not rewritten.
    ALTER TABLE animals ALTER COLUMN photo_url TYPE TEXT;

    -- Camera stream. Empty means there is no camera, and the client says so
    -- honestly instead of showing a dead "watch" button.
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS stream_url TEXT;
    -- The camera usually covers a pen rather than a single animal, so the farm
    -- has a link too. The one on the animal takes priority.
    ALTER TABLE farms   ADD COLUMN IF NOT EXISTS stream_url TEXT;

    -- v1 fractional-ownership columns are no longer needed
    ALTER TABLE animals DROP COLUMN IF EXISTS total_shares;
    ALTER TABLE animals DROP COLUMN IF EXISTS sold_shares;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'animals_status_check') THEN
        ALTER TABLE animals ADD CONSTRAINT animals_status_check
          CHECK (status IN ('active','reserved','owned','sold','slaughtered','dead'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'animals_species_check') THEN
        ALTER TABLE animals ADD CONSTRAINT animals_species_check
          CHECK (species IN ('sheep','cattle','goat'));
      END IF;
    END $$;

    -- ============================================================
    -- 3. Rename sheep_id -> animal_id in the related tables
    -- ============================================================
    DO $$
    DECLARE t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['weight_records','videos','activity'] LOOP
        IF to_regclass('public.' || t) IS NOT NULL
           AND EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = t AND column_name = 'sheep_id')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_name = t AND column_name = 'animal_id') THEN
          EXECUTE format('ALTER TABLE %I RENAME COLUMN sheep_id TO animal_id', t);
        END IF;
      END LOOP;
    END $$;

    CREATE TABLE IF NOT EXISTS weight_records (
      id          SERIAL PRIMARY KEY,
      animal_id   INTEGER REFERENCES animals(id) ON DELETE CASCADE,
      weight_g    INTEGER NOT NULL,
      recorded_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS videos (
      id            SERIAL PRIMARY KEY,
      animal_id     INTEGER REFERENCES animals(id) ON DELETE CASCADE,
      url           VARCHAR(500),
      thumbnail_url VARCHAR(500),
      recorded_at   TIMESTAMP DEFAULT NOW()
    );

    -- Video links can also run past 500 characters
    ALTER TABLE videos ALTER COLUMN url           TYPE TEXT;
    ALTER TABLE videos ALTER COLUMN thumbnail_url TYPE TEXT;

    CREATE TABLE IF NOT EXISTS activity (
      id             SERIAL PRIMARY KEY,
      animal_id      INTEGER REFERENCES animals(id) ON DELETE CASCADE,
      type           VARCHAR(20),
      title_en       VARCHAR(100),
      title_ru       VARCHAR(100),
      title_uz       VARCHAR(100),
      description_en TEXT,
      description_ru TEXT,
      description_uz TEXT,
      meta           JSONB,
      created_at     TIMESTAMP DEFAULT NOW()
    );

    -- English was added in v2 as the primary language
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS title_en       VARCHAR(100);
    ALTER TABLE activity ADD COLUMN IF NOT EXISTS description_en TEXT;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_type_check') THEN
        ALTER TABLE activity ADD CONSTRAINT activity_type_check
          CHECK (type IN ('feeding','weighing','vet','video'));
      END IF;
    END $$;

    -- ============================================================
    -- 4. PRODUCTS — the catalogue. What exactly is sold, and under which model.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS products (
      id               SERIAL PRIMARY KEY,
      model_type       VARCHAR(20) NOT NULL,
      animal_id        INTEGER REFERENCES animals(id),
      farm_id          INTEGER REFERENCES farms(id),
      title_en         VARCHAR(150),
      title_ru         VARCHAR(150),
      title_uz         VARCHAR(150),
      description_en   TEXT,
      description_ru   TEXT,
      description_uz   TEXT,
      photo_url        VARCHAR(500),

      price_tiyin      BIGINT NOT NULL DEFAULT 0,  -- ownership: animal price; installment: full price
      min_amount_tiyin BIGINT,                     -- fixed_income: minimum entry
      term_months      INTEGER,                    -- installment: term; fixed_income: deposit term
      annual_rate_bp   INTEGER,                    -- LEGACY: leftover of the fixed_income model, unused
      meat_weight_g    INTEGER,                    -- installment: promised meat yield

      slots_total      INTEGER DEFAULT 1,
      slots_taken      INTEGER DEFAULT 0,
      status           VARCHAR(20) DEFAULT 'draft',
      -- Monthly boarding fee. May differ from the default in settings:
      -- a larger animal needs more feed.
      boarding_fee_monthly_tiyin BIGINT,
      starts_at        DATE,
      ends_at          DATE,
      created_at       TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS boarding_fee_monthly_tiyin BIGINT;
    ALTER TABLE products ALTER COLUMN photo_url TYPE TEXT;

    -- ============================================================
    -- 4.1 RENAMING THE MODELS TO MATCH THE REAL BUSINESS
    --
    -- Was (from the kit): ownership / installment / fixed_income.
    -- Now:                investment / ownership / installment.
    --
    -- The old ownership was an investment in meaning: the client bought an
    -- animal, the farm raised it, the animal was sold and the client took the
    -- proceeds. So the existing rows move to investment.
    -- The freed-up name ownership goes to a new model: the client buys an
    -- animal, pays boarding monthly and takes it live or as meat.
    --
    -- fixed_income is removed entirely: livestock cannot promise a fixed rate,
    -- and a promised return is an obligation you answer for with money.
    --
    -- ============================================================
    DO $$
    BEGIN
      -- Constraints are dropped before the rename, or the UPDATE runs into them
      ALTER TABLE products  DROP CONSTRAINT IF EXISTS products_model_check;
      ALTER TABLE products  DROP CONSTRAINT IF EXISTS products_model_fields_check;
      UPDATE products SET model_type = 'investment' WHERE model_type = 'ownership';
      DELETE FROM products WHERE model_type = 'fixed_income';

      -- contracts is created further down this file, so on a clean database it
      -- does not exist yet. Without this guard the very first npm run migrate
      -- fails with "relation contracts does not exist".
      IF to_regclass('public.contracts') IS NOT NULL THEN
        ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_model_check;
        UPDATE contracts SET model_type = 'investment' WHERE model_type = 'ownership';

        -- Contracts on the removed model are closed rather than dropped: they
        -- have payouts entries that would otherwise be left orphaned
        UPDATE contracts SET status = 'cancelled', closed_at = NOW()
          WHERE model_type = 'fixed_income' AND status IN ('pending','active');
        IF to_regclass('public.payouts') IS NOT NULL THEN
          DELETE FROM payouts WHERE kind = 'interest'
            AND contract_id IN (SELECT id FROM contracts WHERE model_type = 'fixed_income');
        END IF;
        IF to_regclass('public.transactions') IS NOT NULL THEN
          DELETE FROM transactions
            WHERE contract_id IN (SELECT id FROM contracts WHERE model_type = 'fixed_income');
        END IF;
        DELETE FROM contracts WHERE model_type = 'fixed_income';
      END IF;
    END $$;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_model_check') THEN
        ALTER TABLE products ADD CONSTRAINT products_model_check
          CHECK (model_type IN ('investment','ownership','installment'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_status_check') THEN
        ALTER TABLE products ADD CONSTRAINT products_status_check
          CHECK (status IN ('draft','active','sold_out','closed'));
      END IF;
      -- required fields depend on the model
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_model_fields_check') THEN
        ALTER TABLE products ADD CONSTRAINT products_model_fields_check CHECK (
          -- investment and ownership sell a specific animal at a price
          (model_type NOT IN ('investment','ownership') OR (animal_id IS NOT NULL AND price_tiyin > 0))
          -- installment sells a promise of meat by a deadline
          AND (model_type <> 'installment' OR (term_months IS NOT NULL AND meat_weight_g IS NOT NULL))
        );
      END IF;
    END $$;

    -- ============================================================
    -- 5. CONTRACTS — one user's contract.
    --    Replaces the shares table from v1.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS contracts (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      product_id      INTEGER NOT NULL REFERENCES products(id),
      animal_id       INTEGER REFERENCES animals(id),  -- installment: NULL until shipment
      model_type      VARCHAR(20) NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending',

      principal_tiyin BIGINT NOT NULL DEFAULT 0,  -- the amount agreed on
      paid_tiyin      BIGINT NOT NULL DEFAULT 0,  -- how much was actually paid in
      payout_tiyin    BIGINT NOT NULL DEFAULT 0,  -- how much was paid back out

      term_months     INTEGER,
      annual_rate_bp  INTEGER,
      exit_type       VARCHAR(20),                -- ownership: sale | slaughter

      starts_at       DATE DEFAULT CURRENT_DATE,
      matures_at      DATE,
      closed_at       TIMESTAMP,
      created_at      TIMESTAMP DEFAULT NOW()
    );

    -- The boarding fee is fixed at signing and does not change afterwards,
    -- even if the tariff in settings goes up: the client agreed to this price.
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS boarding_fee_monthly_tiyin BIGINT;
    -- How much boarding has been accrued and how much of it is settled.
    -- investment settles the debt from the sale, ownership pays monthly.
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS boarding_accrued_tiyin BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS boarding_paid_tiyin    BIGINT NOT NULL DEFAULT 0;
    -- Up to which month boarding is already accrued. The cron starts from this
    -- date, so running it twice in one day double-counts nothing.
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS boarding_accrued_until DATE;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_model_check') THEN
        ALTER TABLE contracts ADD CONSTRAINT contracts_model_check
          CHECK (model_type IN ('investment','ownership','installment'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_status_check') THEN
        ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
          CHECK (status IN ('pending','active','completed','cancelled','defaulted'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_exit_check') THEN
        ALTER TABLE contracts ADD CONSTRAINT contracts_exit_check
          CHECK (exit_type IS NULL OR exit_type IN ('sale','slaughter'));
      END IF;
      -- one animal cannot be sold to two owners at the same time
      -- The index condition changed (investment was added), so the old one goes
      IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'contracts_one_owner_per_animal'
                 AND indexdef NOT LIKE '%investment%') THEN
        DROP INDEX contracts_one_owner_per_animal;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'contracts_one_owner_per_animal') THEN
        CREATE UNIQUE INDEX contracts_one_owner_per_animal
          ON contracts (animal_id)
          WHERE model_type IN ('investment','ownership') AND status IN ('pending','active');
      END IF;
    END $$;

    -- ============================================================
    -- 6. PAYMENT_SCHEDULE — payment plan (installment model)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS payment_schedule (
      id           SERIAL PRIMARY KEY,
      contract_id  INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      seq          INTEGER NOT NULL,
      due_date     DATE NOT NULL,
      amount_tiyin BIGINT NOT NULL,
      paid_tiyin   BIGINT NOT NULL DEFAULT 0,
      status       VARCHAR(20) NOT NULL DEFAULT 'pending',
      paid_at      TIMESTAMP,
      UNIQUE (contract_id, seq)
    );

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_schedule_status_check') THEN
        ALTER TABLE payment_schedule ADD CONSTRAINT payment_schedule_status_check
          CHECK (status IN ('pending','paid','overdue','waived'));
      END IF;
    END $$;

    -- ============================================================
    -- 7. PAYOUTS — payouts to the user
    --    fixed_income: interest + principal; ownership: sale_proceeds
    -- ============================================================
    CREATE TABLE IF NOT EXISTS payouts (
      id           SERIAL PRIMARY KEY,
      contract_id  INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      kind         VARCHAR(20) NOT NULL,
      amount_tiyin BIGINT NOT NULL,
      status       VARCHAR(20) NOT NULL DEFAULT 'pending',
      period_start DATE,
      period_end   DATE,
      paid_at      TIMESTAMP,
      created_at   TIMESTAMP DEFAULT NOW()
    );

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payouts_kind_check') THEN
        ALTER TABLE payouts ADD CONSTRAINT payouts_kind_check
          CHECK (kind IN ('interest','principal','sale_proceeds','refund'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payouts_status_check') THEN
        ALTER TABLE payouts ADD CONSTRAINT payouts_status_check
          CHECK (status IN ('pending','paid','cancelled'));
      END IF;
      -- Idempotent interest accrual: the cron may crash and restart on the same
      -- day, and without this index the interest for the period would be
      -- accrued twice. The index is partial — principal and revenue payouts have
      -- an empty period_start and fall outside the constraint.
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'payouts_one_interest_per_period') THEN
        CREATE UNIQUE INDEX payouts_one_interest_per_period
          ON payouts (contract_id, period_start)
          WHERE kind = 'interest';
      END IF;
    END $$;

    -- ============================================================
    -- 8. DELIVERIES — slaughter and meat handover
    --    ownership with exit_type='slaughter' plus every installment
    -- ============================================================
    CREATE TABLE IF NOT EXISTS deliveries (
      id                SERIAL PRIMARY KEY,
      contract_id       INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      animal_id         INTEGER REFERENCES animals(id),
      scheduled_date    DATE,
      slaughter_date    DATE,
      live_weight_g     INTEGER,
      carcass_weight_g  INTEGER,
      cut_type          VARCHAR(30),
      address           TEXT,
      status            VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      delivered_at      TIMESTAMP,
      created_at        TIMESTAMP DEFAULT NOW()
    );

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_status_check') THEN
        ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check
          CHECK (status IN ('scheduled','slaughtered','packed','delivered','cancelled'));
      END IF;
    END $$;

    -- ============================================================
    -- 9. MONEY
    -- ============================================================
    CREATE TABLE IF NOT EXISTS wallet_balances (
      user_id       INTEGER PRIMARY KEY REFERENCES users(id),
      balance_tiyin BIGINT DEFAULT 0,
      updated_at    TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER REFERENCES users(id),
      contract_id  INTEGER REFERENCES contracts(id),
      type         VARCHAR(30) NOT NULL,
      amount_tiyin BIGINT NOT NULL,
      description  VARCHAR(300),
      created_at   TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES contracts(id);

    -- Top-up and withdrawal requests. Until Click and Payme are connected, the
    -- client leaves a request with an amount, an admin approves it, and only
    -- then does money move. A separate table rather than a transaction status:
    -- a transaction is a completed movement of money, and a request sitting in
    -- that table as "waiting" would break every balance calculation.
    CREATE TABLE IF NOT EXISTS payment_requests (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      kind           VARCHAR(20) NOT NULL,
      amount_tiyin   BIGINT NOT NULL CHECK (amount_tiyin > 0),
      status         VARCHAR(20) NOT NULL DEFAULT 'pending',
      note           VARCHAR(300),
      admin_comment  VARCHAR(300),
      transaction_id INTEGER REFERENCES transactions(id),
      created_at     TIMESTAMP DEFAULT NOW(),
      decided_at     TIMESTAMP,
      decided_by     INTEGER REFERENCES users(id)
    );

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_kind_check') THEN
        ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_kind_check
          CHECK (kind IN ('topup','withdrawal'));
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_status_check') THEN
        ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_status_check
          CHECK (status IN ('pending','approved','rejected'));
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_payment_requests_pending
      ON payment_requests (created_at DESC) WHERE status = 'pending';
    CREATE INDEX IF NOT EXISTS idx_payment_requests_user
      ON payment_requests (user_id, created_at DESC);

    -- ============================================================
    -- 10. INDEXES
    -- ============================================================
    CREATE INDEX IF NOT EXISTS users_telegram_id_idx        ON users (telegram_id);
    CREATE INDEX IF NOT EXISTS sms_codes_phone_idx          ON sms_codes (phone);
    CREATE INDEX IF NOT EXISTS animals_farm_idx             ON animals (farm_id);
    CREATE INDEX IF NOT EXISTS animals_status_idx           ON animals (status);
    CREATE INDEX IF NOT EXISTS weight_records_animal_idx    ON weight_records (animal_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS activity_animal_idx          ON activity (animal_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS products_model_status_idx    ON products (model_type, status);
    CREATE INDEX IF NOT EXISTS contracts_user_idx           ON contracts (user_id, status);
    CREATE INDEX IF NOT EXISTS contracts_product_idx        ON contracts (product_id);
    CREATE INDEX IF NOT EXISTS payment_schedule_due_idx     ON payment_schedule (due_date, status);
    CREATE INDEX IF NOT EXISTS payment_schedule_contract_idx ON payment_schedule (contract_id, seq);
    CREATE INDEX IF NOT EXISTS payouts_contract_idx         ON payouts (contract_id);
    CREATE INDEX IF NOT EXISTS transactions_user_idx        ON transactions (user_id, created_at DESC);

    -- ============================================================
    -- 11. LEGACY: shares from v1 is kept but marked
    -- ============================================================
    DO $$
    BEGIN
      IF to_regclass('public.shares') IS NOT NULL THEN
        COMMENT ON TABLE shares IS 'DEPRECATED v1: fractional ownership. Do not use, kept for history.';
      END IF;
    END $$;
  `)

  // Default platform settings — inserted separately so the migration cannot break
  await pool.query(`
    INSERT INTO settings (key, value, comment) VALUES
      ('boarding_fee_monthly_tiyin', '4000000', 'Monthly boarding fee, tiyin (4,000,000 = 40,000 sum)'),
      ('purchase_fee_bp',            '0',       'Purchase fee, bp. 0 for now: an entry barrier scares clients off'),
      ('profit_fee_client_bp',       '0',       'Fee on the client profit, bp. 0 for now'),
      ('profit_fee_farm_bp',         '0',       'Fee on the farm profit, bp. 0 for now'),
      ('late_fee_bp',                '0',       'Late payment penalty, bp per day'),
      ('overdue_grace_days',         '5',       'Days after due_date before the overdue status'),
      ('default_after_missed',       '3',       'Missed payments before the defaulted status'),
      ('models_enabled', 'investment,ownership', 'Which models are open. From investment,ownership,installment')
    ON CONFLICT (key) DO NOTHING;
  `)

  // Settings left over from the previous model, so the admin panel shows no junk
  await pool.query(`
    DELETE FROM settings WHERE key IN ('platform_fee_bp','min_investment_tiyin');
    UPDATE settings SET value = 'investment,ownership'
      WHERE key = 'models_enabled' AND value LIKE '%fixed_income%';

    -- The earlier migration seeded the boarding fee as zero, and ON CONFLICT DO
    -- NOTHING does not overwrite it. Zero is no longer a working value: with no
    -- boarding fee the platform has no revenue at all. Only zeros are changed —
    -- a deliberately set tariff is left alone.
    UPDATE settings SET value = '4000000', updated_at = NOW()
      WHERE key = 'boarding_fee_monthly_tiyin' AND value IN ('0','');
  `)

  console.log('Migration v2 complete')
  process.exit(0)
}

migrate().catch(e => { console.error(e); process.exit(1) })
