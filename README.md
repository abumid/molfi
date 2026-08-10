# Molfi

Livestock investment platform for Uzbekistan. Users buy fractional shares in individual sheep, follow their growth (weight, RFID tag, farm activity log), and receive a payout when the animal is sold.

Full-stack monorepo: React client, React admin panel, Express/PostgreSQL API, Telegram bot integration.

> Built solo — frontend, backend, database schema and integrations.

## Stack

| Layer | Tech |
|---|---|
| Client | React 19, Vite, React Router 7, Zustand, Tailwind 4, `@telegram-apps/sdk` |
| Admin | React 19, Vite, React Router 7, Zustand |
| API | Node.js, Express 5, PostgreSQL (`pg`), JWT, bcrypt |
| Integrations | Telegram Bot API, Eskiz.uz SMS gateway |

## Repository layout

```
molfi/
├── apps/
│   ├── web/          # Investor-facing app (RU/UZ, Telegram Mini App ready)
│   │   └── src/
│   │       ├── pages/        Onboarding, Auth, Catalog, SheepDetail, BuyShare, Wallet, Profile, Admin
│   │       ├── components/   ui/ primitives + layout/BottomNav
│   │       ├── store/        Zustand store
│   │       ├── utils/api.js  Typed API client
│   │       └── i18n/         RU + UZ dictionaries
│   └── admin/        # Back-office panel
│       └── src/pages/        Dashboard, Users, Sheep, Shares, Transactions, Activity, Login
└── server/
    └── src/
        ├── routes/       auth, sheep, shares, wallet, profile, activity, admin
        ├── middleware/   requireAuth / requireAdmin (JWT)
        ├── db/           pool, migrate (schema), seed
        ├── services/     telegramBot.js
        └── utils/        money, calculations, sms, response
```

## Domain logic

**Money.** All amounts are stored as integers in *tiyin* (1 UZS = 100 tiyin) to avoid floating-point drift. Conversion and formatting live in `server/src/utils/money.js`.

**Payouts.** A sheep has a live weight (grams) and a price per kg. Gross revenue is `weight × price_per_kg`; the platform takes 10%, and the remaining investor pool is split by share percentage:

```js
const grossRevenue = weightKg * pricePerKg
const investorPool = grossRevenue - grossRevenue * 0.10
return Math.round(investorPool * (sharePct / 100))
```

`calcProjectedPayout` runs against current weight (what the investor sees in the app), `calcFinalPayout` prefers the real sale price once the animal is sold. See `server/src/utils/calculations.js`.

**Auth.** Phone-first. `check-phone` → `send-sms` (Eskiz.uz) → `verify-sms` → `register`/`login`, plus a `telegram-login` path for users entering through the bot. Passwords are bcrypt-hashed; sessions are JWT with a `role` claim consumed by `requireAdmin`.

## Database

PostgreSQL, 10 tables created idempotently by `server/src/db/migrate.js`:

`users` · `sms_codes` · `farms` · `sheep` · `weight_records` · `shares` · `wallet_balances` · `transactions` · `videos` · `activity`

## API

Base URL `/api`. Routes marked 🔒 require a JWT, 🛡 require `role = admin`.

**Auth** — `POST /auth/check-phone`, `/send-sms`, `/verify-sms`, `/register`, `/login`, `/forgot-password`, `/reset-password`, `/telegram-login` · 🔒 `GET /auth/me`

**Sheep** — `GET /sheep`, `GET /sheep/:id` · 🛡 `POST /sheep/:id/weight`

**Shares** — 🔒 `POST /shares/buy`, `GET /shares/user/:id`

**Wallet** — 🔒 `GET /wallet/balance`, `POST /wallet/topup`, `GET /wallet/transactions`

**Activity** — `GET /sheep/:id/activity` · 🛡 `POST /sheep/:id/activity`, `PUT /activity/:id`, `DELETE /activity/:id`

**Profile** — 🔒 `PUT /profile/update`

**Admin** — 🛡 CRUD over sheep (incl. `POST /admin/sheep/:id/sell` · `/unsell`), users, balances, shares and transactions.

Every handler returns a uniform envelope via `utils/response.js`:

```json
{ "success": true, "data": { } }
{ "success": false, "error": "Unauthorized" }
```

## Running locally

```bash
# 1. Database
createdb molfi

# 2. API
cd server
npm install
cp .env.example .env      # fill in DB creds, JWT_SECRET, BOT_TOKEN
npm run migrate
npm run seed
npm run dev               # http://localhost:3000

# 3. Client
cd apps/web
npm install
cp .env.example .env
npm run dev               # http://localhost:5173

# 4. Admin panel
cd apps/admin
npm install
cp .env.example .env
npm run dev               # http://localhost:5174
```

## Notes

- Interface is fully bilingual (Russian / Uzbek) via a hand-rolled i18n dictionary — no runtime i18n dependency.
- Telegram bot handles onboarding, phone-number capture and verification codes, and opens the app as a Mini App.
- Secrets are never committed; all credentials are read from environment variables. `.env.example` files document the required keys.
