# E-commerce Frontend (Nuxt 4)

Modern e-commerce frontend built with Nuxt 4, Vue 3, and TypeScript.

This store is my playground for learning Python and backend development as I expand from frontend toward full stack. It also lets me explore Nuxt 4 and Nuxt UI, experiment with AI coding agents, LLMs, IDEs and terminals, and use agents to test the application. It is an evolving learning project, not a production-ready store.

## Tech Stack

- **Nuxt 4** with Vue 3 Composition API and TypeScript
- **Nuxt UI 4** — component library (Tailwind CSS v4 via its toolchain, not a direct `tailwindcss` npm dependency)
- **Pinia** — state management
- **@nuxtjs/i18n** — English and Polish (`i18n/locales/`, `i18n/i18n.config.ts`)
- **Zod** — form validation (`shared/validators/`)
- **Vite** — bundler (via Nuxt)

Styling: `app/assets/css/main.css` imports `tailwindcss` and `@nuxt/ui`; `tailwind.config.ts` extends the theme for app-specific tokens.

Requires **Node.js 24** (see `.nvmrc`, `Dockerfile`, CI).

## Quick Start

```bash
npm install
cp .env.example .env.local   # at minimum NUXT_PUBLIC_API_BASE=http://localhost:8000
npm run dev
```

App: http://localhost:3000 — backend API defaults to http://localhost:8000.

## Coverage

File-based routes under `app/pages/` implement the storefront (catalog, cart, checkout), customer account, admin panel, and CMS-driven pages. Playwright specs in `e2e/` exercise critical flows; accessibility sweeps use `@axe-core/playwright` (see `e2e/a11y/`).

## Project structure

```
app/
  assets/css/       # main.css (Tailwind + Nuxt UI)
  components/       # UI by area (shop, cart, checkout, admin, cms, …)
  composables/      # useApi and feature composables
  layouts/  middleware/  plugins/  pages/  stores/
shared/
  constants/  types/  utils/  validators/
i18n/
  i18n.config.ts
  locales/en/  locales/pl/
e2e/                # Playwright tests
scripts/            # check-openapi-types.sh, etc.
```

Nuxt 4 uses `app/` as `srcDir`. Auto-imports apply to composables, stores, and components.

## Commands

| Command | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run generate` | Static generation |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests |
| `npm run e2e` | Playwright E2E |
| `npm run gen:types` | Regenerate `shared/types/api.gen.ts` from backend `/openapi.json` |

## Regenerate API types from backend OpenAPI

`shared/types/api.gen.ts` is generated from the backend OpenAPI spec and committed. After backend schema changes:

```bash
# Backend reachable at http://localhost:8000
npm run gen:types
git add shared/types/api.gen.ts && git commit
```

CI (`codegen-check` in `.github/workflows/test.yml`) boots the backend image and fails if `api.gen.ts` drifts. Local drift check: `scripts/check-openapi-types.sh`.

## Environment variables

```env
NUXT_PUBLIC_API_BASE=http://localhost:8000
```

See `.env.example` for optional public keys (payments, analytics, InPost, etc.).

## Authentication (high level)

Registration, email verification, JWT access tokens with HttpOnly refresh cookies, and password reset flows integrate with `/api/v1/auth/*`. Session handling lives in the Pinia auth store (`app/stores/auth.ts`).

## Internationalization

Translations: `i18n/locales/en/` and `i18n/locales/pl/` (JSON per domain). Locale prefixes in URLs; currency display follows user/locale settings.

## API integration

Typed client helpers point at the FastAPI backend (`NUXT_PUBLIC_API_BASE`). Full route list: backend Swagger at `/docs`.

## Related projects

- Backend: https://github.com/Kasperone/ecommerce_store_backend
