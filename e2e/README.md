# E2E (Playwright)

End-to-end tests for the e-commerce frontend, driving real Nuxt dev (`:3000`) against a real FastAPI backend (`:8000`) and a dedicated `ecommerce_e2e` Postgres database.

## Required env

| Variable | Default | Notes |
|---|---|---|
| `E2E_BACKEND_URL` | `http://localhost:8000` | Backend base URL |
| `E2E_DB_URL` | — | Postgres connection string for `ecommerce_e2e` (required) |

The backend uvicorn process needs:

| Variable | Value | Reason |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:...@192.168.1.14:5433/ecommerce_e2e` | Separate DB so E2E doesn't fight pytest's `ecommerce_test` |
| `RESEND_API_KEY` | `""` | Empty → email sends fail silently; E2E asserts on API responses, not email contents |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1` (PR2 only) | Lets `refresh.spec.ts` exercise silent refresh without a 15-min wait |

## Local prep (one-time)

```bash
# Create the DB on hive (Docker Postgres at 192.168.1.14:5433)
psql -h 192.168.1.14 -p 5433 -U postgres -c "CREATE DATABASE ecommerce_e2e"

# Apply migrations to ecommerce_e2e
cd ecommerce_store_backend
DATABASE_URL=postgresql://postgres:postgres@192.168.1.14:5433/ecommerce_e2e \
  .venv/bin/alembic upgrade head

# Install Chromium for Playwright (one-time)
cd ../ecommerce_store_frontend
npm run e2e:install
```

## Run

```bash
# Terminal 1: backend pointed at the E2E DB
cd ecommerce_store_backend
DATABASE_URL=postgresql://postgres:postgres@192.168.1.14:5433/ecommerce_e2e \
  RESEND_API_KEY="" \
  ENVIRONMENT=development \
  .venv/bin/uvicorn app.main:app --port 8000

# Terminal 2: run the suite (Nuxt dev launched by Playwright's webServer)
cd ecommerce_store_frontend
E2E_DB_URL=postgresql://postgres:postgres@192.168.1.14:5433/ecommerce_e2e \
  npm run e2e

# Or interactively
E2E_DB_URL=... npm run e2e:ui
```

## Layout

```
e2e/
├── fixtures/
│   ├── apiClient.ts      # Playwright request + pg wrapper (register, login, mark verified, trip lockout, ...)
│   └── testUser.ts       # KNOWN_USER, KNOWN_ADMIN, randomEphemeralUser()
├── seed/
│   └── global-setup.ts   # truncates auth tables + seeds known users (runs once before all tests)
├── auth.setup.ts         # logs in KNOWN_USER via API, stashes refresh cookie to playwright/.auth/user.json
└── auth/
    └── login.spec.ts     # 3.1.c happy path (PR1)
```

## Trace + report

- Failed tests drop a trace zip under `playwright/.test-results/<test>/trace.zip`.
- View: `npx playwright show-trace playwright/.test-results/<test>/trace.zip`
- HTML report: `npx playwright show-report`

## What's NOT here

- Click-the-link email flows (covered by backend integration tests)
- Polish-locale assertions (English `/login` only for bring-up)
- Shopping flows (not in the 3.x checklist)
