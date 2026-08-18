import { pool } from './pool.js'

// Molfi v2 — миграция под модели investment / ownership / installment.
// Идемпотентна: можно гонять поверх существующей базы v1.
// Порядок: справочники → переименование sheep→animals → продажи → индексы → дефолтные настройки.

const migrate = async () => {
  await pool.query(`
    -- ============================================================
    -- 0. НАСТРОЙКИ ПЛАТФОРМЫ (вместо хардкода 10% в коде)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS settings (
      key        VARCHAR(60) PRIMARY KEY,
      value      TEXT NOT NULL,
      comment    TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- ============================================================
    -- 1. USERS (без изменений от v1)
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
    -- Язык интерфейса. Дефолт — английский, ru/uz переключаются вручную.
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
    --    Переименовываем, чтобы позже добавить коров и коз.
    --    FK и индексы Postgres переносит автоматически.
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

    -- VARCHAR(500) мало: подписанные ссылки на S3 и Cloudinary регулярно
    -- длиннее, и картинка молча обрезалась бы при вставке. varchar -> text
    -- в Postgres бинарно совместим, таблица не перезаписывается.
    ALTER TABLE animals ALTER COLUMN photo_url TYPE TEXT;

    -- Трансляция с камеры. Пусто — значит камеры нет, и клиент покажет
    -- это честно, а не мёртвую кнопку «смотреть».
    ALTER TABLE animals ADD COLUMN IF NOT EXISTS stream_url TEXT;
    -- Камера чаще стоит на загон, а не на отдельное животное, поэтому
    -- ссылка есть и у фермы. У животного — приоритет.
    ALTER TABLE farms   ADD COLUMN IF NOT EXISTS stream_url TEXT;

    -- v1-поля долевого владения больше не нужны
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
    -- 3. Переименование sheep_id -> animal_id в связанных таблицах
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

    -- Ссылки на видео тоже бывают длиннее 500 символов
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

    -- Английский добавлен в v2 как основной язык
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
    -- 4. PRODUCTS — витрина. Что именно продаём и по какой модели.
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

      price_tiyin      BIGINT NOT NULL DEFAULT 0,  -- ownership: цена животного; installment: полная цена
      min_amount_tiyin BIGINT,                     -- fixed_income: минимальный вход
      term_months      INTEGER,                    -- installment: срок рассрочки; fixed_income: срок вклада
      annual_rate_bp   INTEGER,                    -- ЛЕГАСИ: остаток модели fixed_income, не используется
      meat_weight_g    INTEGER,                    -- installment: обещанный выход мяса

      slots_total      INTEGER DEFAULT 1,
      slots_taken      INTEGER DEFAULT 0,
      status           VARCHAR(20) DEFAULT 'draft',
      -- Абонплата за содержание. Может отличаться от значения по умолчанию
      -- в settings: крупному животному нужно больше корма.
      boarding_fee_monthly_tiyin BIGINT,
      starts_at        DATE,
      ends_at          DATE,
      created_at       TIMESTAMP DEFAULT NOW()
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS boarding_fee_monthly_tiyin BIGINT;
    ALTER TABLE products ALTER COLUMN photo_url TYPE TEXT;

    -- ============================================================
    -- 4.1 ПЕРЕИМЕНОВАНИЕ МОДЕЛЕЙ ПОД РЕАЛЬНЫЙ БИЗНЕС
    --
    -- Было (из кита): ownership / installment / fixed_income.
    -- Стало:          investment / ownership / installment.
    --
    -- Старый ownership по смыслу был инвестицией: клиент покупал животное,
    -- ферма растила, животное продавалось, клиент получал выручку.
    -- Поэтому существующие строки переезжают в investment.
    -- Освободившееся имя ownership занимает новая модель: клиент покупает
    -- животное, платит абонплату помесячно и забирает его живым или мясом.
    --
    -- fixed_income удаляется целиком: животноводство не может обещать
    -- фиксированную ставку, а обещание доходности — обязательство,
    -- за которое отвечают деньгами.
    -- ============================================================
    DO $$
    BEGIN
      -- Констрейнты снимаем до переименования, иначе UPDATE в них упрётся
      ALTER TABLE products  DROP CONSTRAINT IF EXISTS products_model_check;
      ALTER TABLE products  DROP CONSTRAINT IF EXISTS products_model_fields_check;
      UPDATE products SET model_type = 'investment' WHERE model_type = 'ownership';
      DELETE FROM products WHERE model_type = 'fixed_income';

      -- contracts создаётся ниже по файлу, и на чистой базе его здесь
      -- ещё нет. Без этой проверки первый же npm run migrate падает
      -- на «relation contracts does not exist».
      IF to_regclass('public.contracts') IS NOT NULL THEN
        ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_model_check;
        UPDATE contracts SET model_type = 'investment' WHERE model_type = 'ownership';

        -- Договоры по удаляемой модели закрываем, а не бросаем: у них
        -- есть начисления в payouts, которые иначе повиснут сиротами
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
      -- обязательные поля зависят от модели
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_model_fields_check') THEN
        ALTER TABLE products ADD CONSTRAINT products_model_fields_check CHECK (
          -- investment и ownership продают конкретное животное по цене
          (model_type NOT IN ('investment','ownership') OR (animal_id IS NOT NULL AND price_tiyin > 0))
          -- installment продаёт обещание мяса в срок
          AND (model_type <> 'installment' OR (term_months IS NOT NULL AND meat_weight_g IS NOT NULL))
        );
      END IF;
    END $$;

    -- ============================================================
    -- 5. CONTRACTS — договор конкретного пользователя.
    --    Заменяет таблицу shares из v1.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS contracts (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      product_id      INTEGER NOT NULL REFERENCES products(id),
      animal_id       INTEGER REFERENCES animals(id),  -- installment: NULL до отгрузки
      model_type      VARCHAR(20) NOT NULL,
      status          VARCHAR(20) NOT NULL DEFAULT 'pending',

      principal_tiyin BIGINT NOT NULL DEFAULT 0,  -- на какую сумму договорились
      paid_tiyin      BIGINT NOT NULL DEFAULT 0,  -- сколько реально внесено
      payout_tiyin    BIGINT NOT NULL DEFAULT 0,  -- сколько выплачено обратно

      term_months     INTEGER,
      annual_rate_bp  INTEGER,
      exit_type       VARCHAR(20),                -- ownership: sale | slaughter

      starts_at       DATE DEFAULT CURRENT_DATE,
      matures_at      DATE,
      closed_at       TIMESTAMP,
      created_at      TIMESTAMP DEFAULT NOW()
    );

    -- Абонплата фиксируется в момент подписания и дальше не меняется,
    -- даже если тариф в settings подняли: клиент согласился на эту цену.
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS boarding_fee_monthly_tiyin BIGINT;
    -- Сколько начислено за содержание и сколько из этого закрыто.
    -- investment гасит долг из выручки при продаже, ownership — помесячно.
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS boarding_accrued_tiyin BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE contracts ADD COLUMN IF NOT EXISTS boarding_paid_tiyin    BIGINT NOT NULL DEFAULT 0;
    -- До какого месяца абонплата уже начислена. Крон идёт от этой даты,
    -- поэтому повторный запуск в тот же день ничего не задваивает.
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
      -- одно животное не может быть продано двум владельцам одновременно
      -- Условие индекса изменилось (добавился investment), поэтому старый сносим
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
    -- 6. PAYMENT_SCHEDULE — график платежей (модель installment)
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
    -- 7. PAYOUTS — выплаты пользователю
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
      -- Идемпотентность начисления процентов: крон может упасть и
      -- перезапуститься в тот же день, и без этого индекса проценты
      -- за период начислятся дважды. Индекс частичный — у выплат тела
      -- и выручки period_start пустой, они под ограничение не попадают.
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'payouts_one_interest_per_period') THEN
        CREATE UNIQUE INDEX payouts_one_interest_per_period
          ON payouts (contract_id, period_start)
          WHERE kind = 'interest';
      END IF;
    END $$;

    -- ============================================================
    -- 8. DELIVERIES — забой и выдача мяса
    --    ownership с exit_type='slaughter' + все installment
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
    -- 9. ДЕНЬГИ
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

    -- Заявки на пополнение и вывод. Пока Click и Payme не подключены,
    -- клиент оставляет заявку с суммой, админ её одобряет, и только тогда
    -- деньги двигаются. Отдельная таблица, а не статус у транзакции:
    -- транзакция — это свершившийся факт движения денег, и заявка,
    -- лежащая в ней со статусом «ждёт», ломала бы любой подсчёт баланса.
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
    -- 10. ИНДЕКСЫ
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
    -- 11. ЛЕГАСИ: shares из v1 не удаляем, но помечаем
    -- ============================================================
    DO $$
    BEGIN
      IF to_regclass('public.shares') IS NOT NULL THEN
        COMMENT ON TABLE shares IS 'DEPRECATED v1: долевое владение. Не использовать, оставлена для истории.';
      END IF;
    END $$;
  `)

  // Дефолтные настройки платформы — вставляем отдельно, чтобы не ломать миграцию
  await pool.query(`
    INSERT INTO settings (key, value, comment) VALUES
      ('boarding_fee_monthly_tiyin', '4000000', 'Абонплата за содержание в месяц, тийин (4 000 000 = 40 000 сум)'),
      ('purchase_fee_bp',            '0',       'Комиссия при покупке, б.п. Пока 0: барьер входа отпугивает клиентов'),
      ('profit_fee_client_bp',       '0',       'Комиссия с прибыли клиента, б.п. Пока 0'),
      ('profit_fee_farm_bp',         '0',       'Комиссия с прибыли фермы, б.п. Пока 0'),
      ('late_fee_bp',                '0',       'Пеня за просрочку платежа, б.п. в день'),
      ('overdue_grace_days',         '5',       'Сколько дней после due_date до статуса overdue'),
      ('default_after_missed',       '3',       'Сколько пропущенных платежей до статуса defaulted'),
      ('models_enabled', 'investment,ownership', 'Какие модели открыты. Из investment,ownership,installment')
    ON CONFLICT (key) DO NOTHING;
  `)

  // Настройки, оставшиеся от прежней модели, чтобы админка не показывала мусор
  await pool.query(`
    DELETE FROM settings WHERE key IN ('platform_fee_bp','min_investment_tiyin');
    UPDATE settings SET value = 'investment,ownership'
      WHERE key = 'models_enabled' AND value LIKE '%fixed_income%';

    -- Прежняя миграция сеяла абонплату нулём, и ON CONFLICT DO NOTHING
    -- её не перезаписывает. Ноль теперь не рабочее значение: без абонплаты
    -- у платформы нет выручки вообще. Меняем только нули — осознанно
    -- выставленный тариф не трогаем.
    UPDATE settings SET value = '4000000', updated_at = NOW()
      WHERE key = 'boarding_fee_monthly_tiyin' AND value IN ('0','');
  `)

  console.log('Migration v2 complete')
  process.exit(0)
}

migrate().catch(e => { console.error(e); process.exit(1) })
