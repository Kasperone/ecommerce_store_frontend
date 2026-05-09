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
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `2` | Required by `refresh.spec.ts` (PR2). Field is `int` in `app/core/config.py`. TTL=1 collides with the auth store's proactive-refresh window (60s) and hammers `/auth/refresh` until the 30/hour rate limit trips; TTL=2 spaces refreshes 60s apart. The refresh test waits 130s. |

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
    ├── login.spec.ts            # 3.1.c happy path (PR1) + 3.2.b lockout (PR2)
    ├── register.spec.ts         # 3.2.a (PR2)
    ├── password-reset.spec.ts   # 3.2.c (PR2)
    └── refresh.spec.ts          # 3.2.d (PR2)
```

## Trace + report

- Failed tests drop a trace zip under `playwright/.test-results/<test>/trace.zip`.
- View: `npx playwright show-trace playwright/.test-results/<test>/trace.zip`
- HTML report: `npx playwright show-report`

## What's NOT here

- Click-the-link email flows (covered by backend integration tests)
- Polish-locale assertions (English `/login` only for bring-up)
- Shopping flows (not in the 3.x checklist)

## Flags / known issues

### refresh.spec.ts skipped — auth-plugin fix needed

`refresh.spec.ts` is currently `test.skip` pending a frontend fix. The
spec's intent (session continuity past `ACCESS_TOKEN_EXPIRE_MINUTES`)
exposed two real production bugs during bring-up:

1. **Middleware-vs-plugin race on hard reload.** `app/middleware/user.ts`
   reads Pinia synchronously while `app/plugins/auth.ts`'s
   `tryRestoreSession()` is still awaiting `/auth/refresh + /auth/me`.
   Hard-reloading `/account` with a valid refresh cookie redirects to
   `/login` even though both API calls return 200 — the middleware just
   fires too early. Fix: have the route middleware itself await
   `tryRestoreSession()` when auth state isn't loaded yet.

2. **Header SSR/hydration mismatch on `/`.** After the plugin completes,
   the header DOM contains BOTH the unauthenticated `Login` link and the
   authenticated `Logout` button — the `Account` button never renders.
   Fix: switch the header's auth-conditional block to client-only or
   give SSR a cookie-readable auth hint.

Both are user-visible regressions worth fixing in a dedicated PR. Once
fixed, drop the `test.skip` and the spec should pass. See
`e2e/auth/refresh.spec.ts` for the full reproduction.

### Rate-limit accumulation across local runs

`/auth/login` is rate-limited at 5/15min per IP **and** per email. Each
`npm run e2e` does ~3 logins (login happy + lockout + refresh, on
distinct emails). Running the suite 2× back-to-back can trip the per-IP
limit; restart `uvicorn` to reset the in-memory limiter (`memory://`).

A future improvement: a backend env flag to disable rate limiting in E2E
(or a separate Redis store the suite can flush). For now, restart
between iterations and don't be surprised by the `Rate limit exceeded:
5 per 15 minute` message.
