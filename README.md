# E-commerce Frontend (Nuxt 4)

Modern e-commerce frontend built with Nuxt 4, Vue 3, and TypeScript.

## 🛠️ Tech Stack

- **Nuxt 4** - Vue framework
- **Vue 3** - Progressive JavaScript framework
- **TypeScript** - Type-safe development
- **Pinia** - State management
- **Nuxt UI** - Component library
- **Tailwind CSS** - Utility-first CSS
- **Nuxt i18n** - Internationalization (English, Polish)
- **Vite** - Build tool

## 🚀 Quick Start

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

```
frontend/
├── app/
│   ├── layouts/              # Layout components
│   ├── pages/                # Page components
│   │   ├── index.vue         # Home page
│   │   ├── login/
│   │   ├── sign-up/
│   │   ├── verify-email/
│   │   └── verify-email-sent/
│   ├── components/           # Reusable components
│   │   ├── forms/           # Form components
│   │   │   ├── LoginForm.vue
│   │   │   ├── SignUpForm.vue
│   │   │   ├── VerificationForm.vue
│   │   │   └── RegisterBusinessForm.vue
│   │   └── layout/          # Layout components
│   │       ├── Header.vue
│   │       └── Footer.vue
│   ├── composables/         # Reusable logic
│   │   ├── useAuth.ts       # Authentication
│   │   ├── useApi.ts        # API communication
│   │   └── useForm.ts       # Form handling
│   ├── stores/              # Pinia stores
│   │   └── auth.ts          # Authentication state
│   ├── utils/               # Utilities
│   └── app.vue              # Root component
├── assets/
│   ├── css/
│   │   └── main.css         # Global styles
│   └── images/
├── public/                  # Static files
├── nuxt.config.ts           # Nuxt configuration
├── i18n.config.ts           # i18n configuration
├── tsconfig.json            # TypeScript configuration
├── tailwind.config.ts        # Tailwind CSS configuration
└── README.md
```

## 🔑 Features

### Authentication
- User registration (personal & business)
- Email verification with token
- JWT-based authentication
- Secure cookie storage
- Remember me functionality

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

Translations are located in `locales/` directory:

```
locales/
├── en/
│   ├── common.json
│   ├── home.json
│   ├── product.json
│   └── cart.json
└── pl/
    ├── common.json
    ├── home.json
    ├── product.json
    └── cart.json
```

## 📦 Dependencies

- **@nuxt/ui** - UI components
- **@pinia/nuxt** - State management
- **@nuxtjs/i18n** - Internationalization
- **tailwindcss** - Styling
- **vue** - Progressive framework

## 🔗 Related Projects

- Backend: https://github.com/Kasperone/ecommerce_store_backend

## 📝 Notes

- Node.js 18+ required
- Uses Nuxt 4 with Vue 3 Composition API
- TypeScript enabled by default
- Tailwind CSS for styling
