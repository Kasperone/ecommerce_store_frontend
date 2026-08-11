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
| `DATABASE_URL` | `postgresql://postgres:...@10.0.0.1:5433/ecommerce_e2e` | Separate DB so E2E doesn't fight pytest's `ecommerce_test` |
| `RESEND_API_KEY` | `""` | Empty → email sends fail silently; E2E asserts on API responses, not email contents |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `2` | Required by `refresh.spec.ts` (PR2). Field is `int` in `app/core/config.py`. TTL=1 collides with the auth store's proactive-refresh window (60s) and hammers `/auth/refresh` until the 30/hour rate limit trips; TTL=2 spaces refreshes 60s apart. The refresh test waits 130s. |

## Local prep (one-time)

> hive is addressed at its WireGuard IP (`10.0.0.1`) so these commands work from any
> network; the LAN IP `192.168.1.14` only resolves at home and is no longer used in
> config. Tunnel down? `nmcli con up wg-hive`. See `.claude/notes/plans/infra/`.

```bash
# Create the DB on hive (Docker Postgres at 10.0.0.1:5433)
psql -h 10.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE ecommerce_e2e"

# Apply migrations to ecommerce_e2e
cd ecommerce_store_backend
DATABASE_URL=postgresql://postgres:postgres@10.0.0.1:5433/ecommerce_e2e \
  .venv/bin/alembic upgrade head

# Install Chromium for Playwright (one-time)
cd ../ecommerce_store_frontend
npm run e2e:install
```

## Run

```bash
# Terminal 1: backend pointed at the E2E DB
cd ecommerce_store_backend
DATABASE_URL=postgresql://postgres:postgres@10.0.0.1:5433/ecommerce_e2e \
  RESEND_API_KEY="" \
  ENVIRONMENT=development \
  .venv/bin/uvicorn app.main:app --port 8000

# Terminal 2: run the suite (Nuxt dev launched by Playwright's webServer)
cd ecommerce_store_frontend
E2E_DB_URL=postgresql://postgres:postgres@10.0.0.1:5433/ecommerce_e2e \
  npm run e2e

# Or interactively
E2E_DB_URL=... npm run e2e:ui
```

## Layout

**67 committed specs** across 7 area directories plus the root seed spec. Keep
this count honest — it is load-bearing for how a cold session reasons about
coverage. The per-feature ledger is
`<project-root>/.claude/notes/research/2026-07-24-e2e-coverage-matrix.md`.

```
e2e/
├── seed.spec.ts          # agents' seed test: boot + auth conventions (also runs as a cheap smoke spec)
├── fixtures/
│   ├── apiClient.ts      # Playwright request + pg wrapper (register, login, mark verified, trip lockout, product+image CRUD ...)
│   ├── images/           # tiny PNG fixtures committed to the repo for admin/product-gallery.spec.ts
│   └── testUser.ts       # KNOWN_USER, KNOWN_ADMIN, randomEphemeralUser()
├── helpers/
│   └── uinputnumber.ts   # clear/set wrappers for Nuxt UI UInputNumber (raw DOM mutation doesn't sync to v-model)
├── seed/
│   └── global-setup.ts   # truncates auth tables + seeds known users (runs once before all tests)
├── auth.setup.ts         # logs in KNOWN_USER via API, stashes refresh cookie to playwright/.auth/user.json
├── account/     (12)     # profile, preferences, security/sessions, addresses, GDPR export, reorder
├── admin/       (32)     # the back-office: catalog, orders, staff/RBAC, CMS, settings, reports ...
├── auth/         (5)     # login, register, password-reset, refresh, lockout
├── checkout/    (14)     # cart → single-page checkout, payments, coupons, VAT, PL money path
├── collections/  (1)     # manual collections
├── search/       (1)     # Meilisearch-backed storefront search
└── seo/          (1)     # sitemap / JSON-LD / hreflang / robots artifacts

specs/                    # human-readable test plans written by the planner agent
.claude/agents/           # Playwright test agents: planner / generator / healer (committed)
```

### Nuxt UI input helpers

`UInputNumber` consumes keyboard events to manage its own state — driving it via `locator.fill('')` or DOM `.value = ''` mutation updates the displayed text but skips Vue's v-model. The form then submits the *stale* value. `e2e/helpers/uinputnumber.ts` wraps the focus + select-all + delete + tab sequence in `clearUInputNumber(locator)` and `setUInputNumber(locator, value)`; use them whenever a spec interacts with a price/stock/count field.

```ts
import { uInputNumberByLabel, setUInputNumber, clearUInputNumber } from '~/e2e/helpers/uinputnumber'

const pln = uInputNumberByLabel(page, 'PLN')
await setUInputNumber(pln, 42.5)
// ...
await clearUInputNumber(pln)
```

## Trace + report

- Failed tests drop a trace zip under `playwright/.test-results/<test>/trace.zip`.
- View: `npx playwright show-trace playwright/.test-results/<test>/trace.zip`
- HTML report: `npx playwright show-report`

## What's NOT here

By *feature*, coverage is broad (see the coverage matrix). What is missing is
whole **kinds** of test — track this list, not just the feature matrix:

- Click-the-link email flows (covered by backend integration tests)
- **Cross-browser** — Chromium only, no WebKit/Firefox project
- **Mobile viewports** — no device project; the 375px overflow sweep is manual
- **Visual regression** — no `toHaveScreenshot`; deliberate (high maintenance
  against a Tailwind app), revisit only for the CMS block registry
- **Performance / Core Web Vitals** — unmeasured, despite the shipped SEO program

Partially covered, worth knowing the edges of:

- **Polish locale** — 3 specs touch `/pl/` (`checkout/pl-money-path`,
  `checkout/vat-decomposition`, `seo/seo-artifacts`), all money/SEO paths. No
  spec asserts that a rendered `/pl/` page is free of English fallback copy —
  the `app.scripts.audit_translations` pre-deploy gate checks the *data* layer
  and structurally cannot see the fallback render path.
- **Fault / error states** — `page.route` appears in exactly one spec
  (`admin/category-hero-seo.spec.ts`). Payment 500s, order-POST failures,
  Meilisearch 503 and offline are unexercised.
- **Page-level a11y** — `axe-core` + `vitest-axe` cover 20+ components, but
  never a composed page, so landmark structure, heading order, cross-component
  duplicate ids and full-page focus order are unchecked.

## Flags / known issues

### Rate-limit accumulation across local runs

`/auth/login` is rate-limited at 5/15min per IP **and** per email. Each
`npm run e2e` does ~3 logins (login happy + lockout + refresh, on
distinct emails), so back-to-back runs used to trip the per-IP limit.

**Fixed (backend PR #147):** run the backend with the double-gated
kill-switch and the limiter becomes a true no-op:

```bash
ENVIRONMENT=development E2E_DISABLE_RATE_LIMIT=true ... uvicorn app.main:app
```

Both gates are required — the flag is ignored (with a startup warning)
outside `development`, so production can never lose rate limiting. CI's
backend containers set it (see `.github/workflows/test.yml`). If you run
the backend *without* the flag, the old advice applies: restart `uvicorn`
to reset the in-memory limiter (`memory://`).

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
E2E_DB_URL=postgresql://postgres:postgres@10.0.0.1:5433/ecommerce_e2e \
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

## The four layers (which tool for which job)

| Layer | Invocation | Use for |
|---|---|---|
| **Playwright MCP** (browser server) | project-root `.mcp.json` (`@playwright/mcp`, pinned `0.0.79`) | Exploration, first-look at a new flow, multi-step discovery, payment-sandbox walkthroughs, visual CMS canvas, EN/PL parity, mobile-overflow audits |
| **Test agents** (`.claude/agents/`) | planner / generator / healer subagents (need a Claude Code session **in this repo**; they speak to `npx playwright run-test-mcp-server` via this repo's `.mcp.json`) | Turning a flow into a durable runner spec; debugging/repairing failing specs |
| **Agent CLI** (`npx @playwright/cli@0.1.18`) | `playwright-cli open/goto/snapshot/click/…` — artifacts to disk, ~4× cheaper than MCP | Routine "does this still render / does this button do X" verify passes |
| **Runner** (`npm run e2e`) | deterministic suite | CI, regression — **the source of truth** |

When any other layer and `npm run e2e` disagree (timing, isolation,
storage state), trust the runner.

**Pin both npx-invoked layers.** `@playwright/mcp` is pinned in `.mcp.json`;
quote `@playwright/cli@0.1.18` explicitly rather than letting npx float to
whatever the cache holds — an unpinned tool layer is the drift the MCP pin
exists to prevent.

### The two servers are not equivalent

`playwright-test` (the agents' server) is a **strict superset** of the
exploration server — 87 tools vs 46 on Playwright 1.62.1. Two consequences
that the layer table above hides:

- **The runner is drivable from a session.** `test_run` / `test_list` /
  `test_debug` are MCP tools; the runner is not a Bash-only layer.
- **Network mocking is already available**, with no extra capability flag:
  `browser_route` / `browser_unroute` / `browser_route_list`, plus
  `browser_network_state_set` for offline. Tracing and video capture too.

Re-survey the tool list after any version bump — `npx playwright init-agents
--loop=claude` regenerates the three agent definitions against the installed
runner, and it **overwrites this repo's `.mcp.json`**, dropping the `env`
block (`E2E_DB_URL`) and the `--headless -c playwright.config.ts` args. Restore
them after every regen or the agents run against a config that cannot reach pg.

### Test agents (planner → generator → healer)

Scaffolded via `npx playwright init-agents --loop=claude` (Playwright ≥1.55).
The three agent definitions live in `.claude/agents/` (committed — they carry
project conventions) and the **seed test** is `e2e/seed.spec.ts`: it encodes
boot, API-login + refresh-cookie auth, fixtures, and locator/code style, and
the generator copies it as the starting point of every generated spec.

- **Planner**: explores the live app, writes a Markdown plan under `specs/`.
- **Generator**: executes a plan step-by-step against the live app (so
  locators are verified, not hallucinated) and emits a `*.spec.ts`.
- **Healer**: runs failing specs, inspects the live UI, patches
  locators/waits. Point it at the failing subset only.

**Curate hard**: agents over-generate scenarios and can hallucinate
assertions. Keep the happy path + truly distinct edge cases; verify every
assertion encodes a real business rule before committing.

### Promotion ritual (verify → spec)

After MCP-verifying a **new money-path feature** (checkout, payments,
coupons, orders, quotes…), the close-out step is to promote that proof into
a runner spec: run the generator on the flow (or port the MCP transcript by
hand), land it as a small PR, runner-green. Verification must not evaporate.

## Authoring with Playwright MCP

Playwright MCP (`@playwright/mcp`, pinned in the project-root `.mcp.json`)
is wired into Claude Code for snapshot-driven exploration against the same
dev stack used here. **MCP is for exploration + debugging; the runner stays
the source of truth.** Ad-hoc verify screenshots belong under
`playwright/.mcp-output/<YYYY-MM-DD>-<feature>/` — never in the project root.
Save with the full path: bare filenames resolve against cwd and leak outside
the output dir (only the MCP server's `--output-dir` is pinned; the agent CLI
writes to cwd). The auto-dropped `page-*.yml` / `console-*.log` files in
`.mcp-output/` are throwaway — delete them at session close-out.

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

- The **exploration** server (`playwright`) runs in allowlist mode: ~20
  origins — `localhost:3000` / `:8000`, the PayU and Stripe sandbox hosts,
  hCaptcha and the R2 dev bucket. Anything else is denied. **Do not pair
  with `--blocked-origins=*`**: per `npx @playwright/mcp@latest --help`,
  *"Blocklist is evaluated before allowlist"*, so the wildcard nukes the
  allowlist and every navigate fails with `ERR_BLOCKED_BY_CLIENT`. Note the
  upstream caveat that the allowlist *"does not serve as a security boundary
  and does not affect redirects"* — it is a scoping tool, not a sandbox.
- ⚠️ **The allowlist does not apply to the agents' server.**
  `npx playwright run-test-mcp-server` accepts only `--headless`, `-c/--config`,
  `--host` and `--port` — there is **no `--allowed-origins` and no `--isolated`
  flag to give it**, and Playwright config has no origin-allowlist equivalent.
  So planner/generator/healer runs can navigate anywhere and keep a
  profile on disk. This is a structural limitation, not an oversight to fix in
  config: treat agent runs as unscoped and keep them pointed at the local
  stack by discipline.
- Page/console/network content surfaced through MCP flows to Anthropic's API.
  On the exploration server the allowlist bounds that to local fixtures plus
  the sandbox hosts above; **on the agents' server nothing bounds it.**
- End every session with `browser_close`. The exploration server's
  `--isolated` profile is in-memory but a hung Chromium can pin port 9222.
- `--timeout-settle=1000` (default 500 ms) is set on the exploration server to
  absorb this codebase's dominant flake class — a post-mutation re-render
  eating the next interaction. Raise it further before blaming a locator.
- Long-form setup + retro-validation findings live at
  `<project-root>/.claude/notes/plans/tooling/` and
  `<project-root>/.claude/notes/research/2026-05-10-playwright-mcp-setup.md`
  (project root is local-only; not in this repo).
