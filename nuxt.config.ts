// https://nuxt.com/docs/api/configuration/nuxt-config
import { createResolver } from '@nuxt/kit'

const { resolve } = createResolver(import.meta.url)

export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/i18n',
  ],

  // Components configuration
  components: [
    {
      path: '~/components',
      pathPrefix: true,
    },
  ],

  // Auto-imports configuration
  imports: {
    dirs: [
      'composables',
      'composables/**',
      'stores',
      'utils',
      'utils/**',
    ],
  },

  // Nuxt 4 uses app/ as default srcDir
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  // App configuration
  app: {
    head: {
      title: 'E-commerce Store',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Modern e-commerce platform' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],

  // Runtime config for API base URL.
  // Empty default → useApi() calls relative URLs that traverse the proxy above.
  // The proxy still reads NUXT_PUBLIC_API_BASE at startup for the upstream target.
  runtimeConfig: {
    // Server-only (never exposed to the client): shared secret for the backend's
    // SSR session-validation endpoint (POST /auth/refresh/ssr). Sent as the
    // X-SSR-Secret header so the SSR auth restore can mint an access token
    // WITHOUT rotating the refresh cookie — removing the rotation/Set-Cookie
    // race + 30/hour rate-limit pressure that caused hydration mismatches on
    // hard reloads. Populated from NUXT_SSR_SHARED_SECRET; must match the
    // backend's SSR_SHARED_SECRET. Empty → the SSR restore falls back to the
    // legacy rotating /auth/refresh (no regression for unconfigured envs).
    ssrSharedSecret: '',
    public: {
      apiBase: '',
    },
  },

  // Alias configuration for shared directory
  alias: {
    '#shared': resolve('./shared'),
  },

  // Nitro proxy: every /api/v1/** request hitting the frontend gets forwarded to
  // the backend so the auth cookie becomes first-party on localhost:3000. This
  // is what lets the SSR auth plugin validate the session on every page load
  // (the cookie is now Path=/ and rides on requests to the frontend domain,
  // so Nuxt server can read it via useRequestHeaders and forward to /auth/refresh).
  // Scoped to /api/v1/** so Nuxt-internal endpoints like /api/_nuxt_icon/*
  // (served by @nuxt/icon) stay local and aren't 404'd by the backend.
  routeRules: {
    '/api/v1/**': {
      proxy: `${process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000'}/api/v1/**`,
    },
  },
  compatibilityDate: '2025-07-15',

  // Vite configuration
  vite: {
    resolve: {
      alias: {
        '#shared': resolve('./shared'),
      },
    },
  },

  eslint: {
    config: {
      stylistic: {
        indent: 2,
        quotes: 'single',
        semi: false,
        commaDangle: 'always-multiline',
      },
    },
  },

  // i18n Configuration
  i18n: {
    locales: [
      {
        code: 'en',
        iso: 'en-US',
        name: 'English',
        files: ['en/common.json', 'en/home.json', 'en/product.json', 'en/cart.json', 'en/legal.json', 'en/cookies.json', 'en/blocks.json'],
      },
      {
        code: 'pl',
        iso: 'pl-PL',
        name: 'Polski',
        files: ['pl/common.json', 'pl/home.json', 'pl/product.json', 'pl/cart.json', 'pl/legal.json', 'pl/cookies.json', 'pl/blocks.json'],
      },
    ],
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    },
  },
})
