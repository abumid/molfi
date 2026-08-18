# Molfi

Livestock investment platform for Uzbekistan. A person buys a specific animal on a working farm in the Tashkent region, follows its weight from the app, and decides when to exit — taking the sale proceeds or the meat.

*Mol* is Uzbek for livestock, and for wealth.

Full-stack monorepo: React client with a public landing page, React admin panel, Express/PostgreSQL API, Telegram bot.

## Two models

| | Investment | Ownership |
|---|---|---|
| What you buy | A specific animal | A specific animal |
| Care fee | Accrues, deducted from the sale | 40,000 som per month from the wallet |
| Exit | Sell, take the proceeds | Take it live or as meat |
| Market risk | Yours | None — nothing is sold |

There is no fixed-return model, and there never will be: livestock cannot deliver a guaranteed rate. Every figure the app shows is an estimate from current weight × price per kilogram, and it is labelled as such.

A third model, `installment`, exists in the schema but is switched off through `settings.models_enabled`. Products and contracts of a disabled model never reach the catalogue and cannot be bought, even by direct link.

## Stack

| Layer | Tech |
|---|---|
| Client | React 19, Vite 7, React Router 7, Zustand 5 |
| Admin | React 19, Vite 7, React Router 7, Zustand 5 |
| API | Node.js, Express 5, PostgreSQL (`pg`), JWT, bcrypt |
| Integrations | Telegram Bot API, Eskiz.uz SMS gateway |

Three languages everywhere — English (default), Russian, Uzbek — through hand-rolled dictionaries, no runtime i18n dependency.

## Layout

```
molfi/
├── apps/
│   ├── web/                     Client + public landing (port 5173)
│   │   ├── public/              Logos in WebP + PNG, robots.txt, sitemap.xml
│   │   ├── scripts/prerender.mjs  Bakes the landing markup into dist/index.html
│   │   └── src/
│   │       ├── pages/           Landing, Legal, Auth, Catalog, ProductDetail,
│   │       │                    Checkout, Contracts, ContractDetail, Wallet, Profile
│   │       ├── components/      BalanceCard, AnimalHero, WeightChart, ActivityFeed, ui/
│   │       ├── i18n/            index.js (app), landing.js, legal.js
│   │       └── utils/           api, format, animal, portfolio, storage, payments
│   └── admin/                   Back-office (port 5174)
│       └── src/pages/           Dashboard, Animals, Activity, Products, Contracts,
│                                Payments, Users, Transactions, Requests, Settings
└── server/                      API (port 3000)
    └── src/
        ├── routes/              auth, animals, products, contracts, payments,
        │                        activity, wallet, profile, admin
        ├── jobs/                accrueBoarding, markOverdue
        ├── db/                  pool, migrate, seed.demo
        ├── services/            telegramBot
        └── utils/               calculations, settings, sms, response
```

## Money

All amounts are integer **tiyin** — 1 som = 100 tiyin. Rates are basis points: 300 = 3%. Floats never touch money.

Fees live in the `settings` table, not in code. Today the purchase fee and both profit fees are 0; the only revenue is the monthly care fee. Changing a rate is a settings edit, not a deploy.

## Running locally

```bash
createdb molfi

cd server && npm install
cp .env.example .env          # fill in DB creds, JWT_SECRET, BOT_TOKEN
npm run migrate
npm run seed                  # 12 demo offers; remove with: npm run seed -- --clean
npm run dev                   # http://localhost:3000

cd apps/web && npm install && cp .env.example .env && npm run dev    # :5173
cd apps/admin && npm install && cp .env.example .env && npm run dev  # :5174
```

The demo seed marks everything it creates with an RFID prefix `DEMO-` and only ever deletes its own rows. It refuses to run the cleanup if a demo animal already has a contract.

## Scripts

**server** — `dev`, `start`, `migrate`, `seed`, `smoke`, `e2e`, `jobs`, `boarding`, `job:boarding`, `job:overdue`

**apps/web** — `dev`, `build` (client + SSR pass + prerender), `build:nossr`, `lint`, `preview`

**apps/admin** — `dev`, `build`, `lint`, `preview`

Tests under `server/test/` need a running server and a live database; they hit the real API.

## Environment

Every key is documented in the `.env.example` next to the app that reads it. `.env` files are git-ignored and have never been committed.

Client variables carry a `VITE_` prefix and are bundled into the JavaScript — they are visible to anyone. Secrets belong only in `server/.env`.

## Notes

- The landing lives at `/` inside the client app, not as a separate build: the domain is shared, and a second bundle behind nginx would add a moving part for nothing.
- `npm run build` in `apps/web` runs a second SSR pass and bakes the landing markup into `dist/index.html`, so crawlers and link previews see real text instead of an empty root node.
- Payments through Click and Payme are not connected yet. Until they are, a client files a top-up or withdrawal request and an admin approves it in **Requests** — only then does money move.
- The public offer and privacy pages are drafts and have not been reviewed by a lawyer. Both carry a visible notice saying so.
