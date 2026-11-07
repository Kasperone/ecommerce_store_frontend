# E-commerce Frontend (Nuxt 4)

Modern e-commerce frontend built with Nuxt 4, Vue 3, and TypeScript.

This store is my playground for learning Python and backend development as I expand from frontend toward full stack. It also lets me explore Nuxt 4 and Nuxt UI, experiment with AI coding agents, LLMs, IDEs and terminals, and use agents to test the application. It is an evolving learning project, not a production-ready store.

## 🛠️ Tech Stack

- **Nuxt 4** - Vue framework
- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe development
- **Pinia** - State management
- **Nuxt UI** - Component library (ships Tailwind CSS v4; styling is wired through Nuxt UI and `app/assets/css/main.css`, not a direct `tailwindcss` package dependency)
- **Nuxt i18n** - Internationalization (English, Polish)
- **Vite** - Build tool

## 🚀 Quick Start

Requires **Node.js 24** (`.nvmrc`, `Dockerfile`, CI).

### 1. Install dependencies

```bash
npm install
```

### 2. Setup environment variables

```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

### 3. Start development server

```bash
npm run dev
```

Application will be available at: http://localhost:3000

## 📁 Project Structure

Nuxt 4 uses `app/` as `srcDir` (top-level overview):

```
app/
  assets/css/          # main.css (@import tailwindcss + @nuxt/ui)
  components/  blocks/  composables/  layouts/  middleware/
  pages/               # storefront, /admin/*, checkout, account, CMS (`[...slug].vue`)
  plugins/  stores/
shared/
  constants/  types/  utils/  validators/
i18n/
  i18n.config.ts
  locales/en/  locales/pl/
e2e/                   # Playwright specs (incl. e2e/a11y/ axe sweeps)
public/  nuxt.config.ts  tailwind.config.ts
```

## 🔑 Features

Routes under `app/pages/` cover the storefront (catalog, cart, checkout), customer account, admin panel, and CMS-driven pages. `npm run e2e` runs Playwright against a backend image; accessibility checks use `@axe-core/playwright` in `e2e/a11y/`.

### Authentication
- User registration (personal & business)
- Email verification with token
- JWT-based authentication
- Secure cookie storage

### Internationalization
- Multi-language support (English, Polish)
- Dynamic locale switching
- URL-based locale detection
- Browser language detection
- Currency formatting per locale

### State Management
- Centralized auth state with Pinia
- Persistent user session
- Token refresh handling

### Forms
- Login form
- Sign-up form (personal & business)
- Email verification form
- Form validation
- Error handling

## 🏗️ Build Commands

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Generate Static Site (if needed)

```bash
npm run generate
```

### Regenerate API types from backend OpenAPI

`shared/types/api.gen.ts` is generated from the backend's `/openapi.json`
and committed. Whenever the backend changes a request/response schema:

```bash
# Backend must be reachable at http://localhost:8000
npm run gen:types
git add shared/types/api.gen.ts && git commit
```

CI (`codegen-check` job) boots the backend image and fails the PR if the
checked-in `api.gen.ts` doesn't match. The local drift detector script is
`scripts/check-openapi-types.sh`.

## 🔐 Environment Variables

Create `.env.local` file in the frontend root:

```env
NUXT_PUBLIC_API_BASE=http://localhost:8000
```

## 🌐 API Integration

The frontend communicates with the FastAPI backend at `http://localhost:8000`. Key endpoints:

- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/verify-email` - Email verification
- `POST /api/v1/auth/refresh` - Token refresh

## 🎨 Component System

Components are organized with auto-import enabled:
- `components/forms/LoginForm.vue` → `<FormLoginForm />`
- `components/layout/Header.vue` → `<LayoutHeader />`

## 🌍 Internationalization

Translations live in `i18n/locales/en/` and `i18n/locales/pl/` (JSON per domain). `@nuxtjs/i18n` module options (locales, `defaultLocale`, `detectBrowserLanguage`, URL strategy) are in `nuxt.config.ts`; `i18n/i18n.config.ts` holds vue-i18n runtime options (plural rules, number formats).

## 📦 Dependencies

- **@nuxt/ui** - UI components
- **@pinia/nuxt** - State management
- **@nuxtjs/i18n** - Internationalization
- **vue** - Progressive framework

## 🔗 Related Projects

- Backend: https://github.com/Kasperone/ecommerce_store_backend

## 📝 Notes

- Node.js 24 required (see `.nvmrc`)
- Uses Nuxt 4 with Vue 3 Composition API
- TypeScript enabled by default
