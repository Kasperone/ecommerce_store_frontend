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
│   ├── apiClient.ts      # Playwright request + pg wrapper (register, login, mark verified, trip lockout, product+image CRUD ...)
│   ├── images/           # tiny PNG fixtures committed to the repo for admin/product-gallery.spec.ts
│   └── testUser.ts       # KNOWN_USER, KNOWN_ADMIN, randomEphemeralUser()
├── seed/
│   └── global-setup.ts   # truncates auth tables + seeds known users (runs once before all tests)
├── auth.setup.ts         # logs in KNOWN_USER via API, stashes refresh cookie to playwright/.auth/user.json
├── auth/
│   ├── login.spec.ts            # 3.1.c happy path (PR1) + 3.2.b lockout (PR2)
│   ├── register.spec.ts         # 3.2.a (PR2)
│   ├── password-reset.spec.ts   # 3.2.c (PR2)
│   └── refresh.spec.ts          # 3.2.d (PR2)
└── admin/
    └── product-gallery.spec.ts  # real-R2 gallery lifecycle (opt-in via E2E_R2_ENABLED)
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

### Rate-limit accumulation across local runs

`/auth/login` is rate-limited at 5/15min per IP **and** per email. Each
`npm run e2e` does ~3 logins (login happy + lockout + refresh, on
distinct emails). Running the suite 2× back-to-back can trip the per-IP
limit; restart `uvicorn` to reset the in-memory limiter (`memory://`).

A future improvement: a backend env flag to disable rate limiting in E2E
(or a separate Redis store the suite can flush). For now, restart
between iterations and don't be surprised by the `Rate limit exceeded:
5 per 15 minute` message.

### Real-R2 gallery spec

`e2e/admin/product-gallery.spec.ts` drives the admin image gallery
against a real Cloudflare R2 dev bucket. It is opt-in.

**What's covered.** Upload via the drop-zone file input (two POSTs →
real R2), set-primary via UI click (PATCH `is_primary`), and an
API-driven delete that proves the gallery reactively re-renders when an
image disappears server-side. Alt-text, drag-reorder, and the
delete-popover *UI* flow are documented as known E2E gaps in the spec
file — they're covered by Vitest specs against the same Vue source
because driving Nuxt UI's UInput / `@formkit/drag-and-drop` /
UPopover from headless Playwright is unreliable.

**Opt-in flag.** `test.skip(!process.env.E2E_R2_ENABLED, ...)` gates the
whole describe block. Without `E2E_R2_ENABLED=1` the spec reports
skipped — CI runs the suite as-is and skips this file because R2 vars
aren't wired in.

**Required backend env.** The five `R2_*` vars must be set on the
uvicorn process (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`). Dev creds
live in `ecommerce_store_backend/.env` (gitignored); bucket
`ecommerce-store-dev` has CORS restricted to `http://localhost:3000`.

**Fixtures.** Two 16×16 PNGs at `e2e/fixtures/images/gallery-{red,blue}.png`
are committed (~80 B each). Different solid colours so each upload
produces a distinct R2 key; 16×16 keeps Pillow's dimension-capture path
honest while staying tiny.

**Run only this spec.**

```bash
E2E_DB_URL=postgresql://postgres:postgres@192.168.1.14:5433/ecommerce_e2e \
E2E_R2_ENABLED=1 \
  npm run e2e -- e2e/admin/product-gallery.spec.ts
```

**Cleanup contract.** A `finally` block deletes every surviving image
via the backend's `DELETE /products/{id}/images/{imageId}` route (which
strips the R2 object) and then deletes the product. R2 keys live at
`products/<product_id>/<uuid>.<ext>`; orphans after a hard crash
(SIGKILL) are recoverable via the R2 dashboard. A scheduled scrubber
script is future work.

**CI.** Deferred. Wiring this in CI needs either a dedicated test
bucket plus GitHub secrets, or a moto sidecar in the backend image.
The env-flag skip is the contract until that decision lands.

## Authoring with Playwright MCP

Playwright MCP (`@playwright/mcp@latest`, v0.0.75) is wired into Claude
Code at the project root (`.mcp.json`) for snapshot-driven spec
authoring against the same dev stack used here. **MCP is for authoring +
debugging; the runner stays the source of truth.** When MCP and
`npm run e2e` disagree (timing, isolation, storage state), trust the
runner.

### Bring-up

1. Stack up per [Run](#run). `globalSetup` is idempotent — running any
   spec once seeds `KNOWN_USER` / `KNOWN_ADMIN` / `LOCKOUT_USER` /
   `REFRESH_USER` for the session.
2. In a Claude Code session at project root, the first message must name
   **"Playwright MCP"** explicitly (otherwise Claude has a documented
   fallback to `npx playwright` via Bash, which neither shares state nor
   benefits from the snapshot flow).

### Loop per flow

`browser_navigate` → `browser_wait_for { text }` to clear hydration →
`browser_snapshot` for refs → `browser_fill_form` / `browser_click`
keyed by `eN` ref → `browser_wait_for` post-action → assert via
`browser_verify_*`. Cross-check via `browser_network_requests`. Snapshot
once per material DOM change — chains of clicks/types should reuse refs
from the prior snapshot, not re-snapshot.

### Locator-style adaptation

MCP defaults to `getByRole('textbox', { name: 'Email' })` for inputs;
the codebase prefers `getByLabel(/email/i)` (more resilient to copy
edits). When porting an MCP-authored spec into the suite:

- inputs: `getByRole('textbox', { name: 'Email' })` → `getByLabel(/email/i)`
- disambiguation: `name: 'Password', exact: true` → `getByLabel(/^password$/i)`
- buttons: keep `getByRole('button', { name: /continue/i })` — just lowercase the regex

### Authenticated state

Log in via the form within the MCP session. `browser_cookie_list` then
shows `refresh_token` at `path=/api/v1/auth` (matches the auth-flow
contract). `playwright/.auth/user.json` from a prior run may be stale
(rotation/revocation since save) and the auth-plugin's boot
`/auth/refresh` will 401 — log in fresh instead of fighting it.

### Caveats

- `.mcp.json` uses `--allowed-origins=http://localhost:3000;http://localhost:8000`
  alone — allowlist mode means anything else is denied. **Do not pair
  with `--blocked-origins=*`**: per `npx @playwright/mcp@latest --help`,
  *"Blocklist is evaluated before allowlist"*, so the wildcard nukes the
  allowlist and every navigate fails with `ERR_BLOCKED_BY_CLIENT`.
- Page/console/network content surfaced through MCP flows to Anthropic's
  API — the allowlist keeps that to local fixtures.
- End every session with `browser_close`. `--isolated` profile is
  in-memory but a hung Chromium can pin port 9222.
- Long-form setup + retro-validation findings live at
  `<project-root>/.claude/notes/plans/tooling/` and
  `<project-root>/.claude/notes/research/2026-05-10-playwright-mcp-setup.md`
  (project root is local-only; not in this repo).
