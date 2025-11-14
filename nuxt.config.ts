// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  
  // Nuxt 4 uses app/ as default srcDir
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  
  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/i18n',
  ],
  
  // Components configuration
  components: [
    {
      path: '~/components',
      pathPrefix: false,
    },
  ],
  
  // Auto-imports configuration
  imports: {
    dirs: [
      'composables',
      'composables/**',
      'utils',
      'utils/**'
    ]
  },
  
  // Alias configuration for shared directory
  alias: {
    '#shared': fileURLToPath(new URL('./shared', import.meta.url))
  },
  
  // Vite configuration
  vite: {
    resolve: {
      alias: {
        '#shared': fileURLToPath(new URL('./shared', import.meta.url))
      }
    }
  },
  
  // i18n Configuration
  i18n: {
    locales: [
      {
        code: 'en',
        iso: 'en-US',
        name: 'English',
        files: ['en/common.json', 'en/home.json', 'en/product.json', 'en/cart.json']
      },
      {
        code: 'pl',
        iso: 'pl-PL',
        name: 'Polski',
        files: ['pl/common.json', 'pl/home.json', 'pl/product.json', 'pl/cart.json']
      },
    ],
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    lazy: true,
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    },
    // Number formats for currency
    numberFormats: {
      en: {
        currency: {
          style: 'currency',
          currency: 'USD',
          notation: 'standard'
        },
        decimal: {
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      },
      pl: {
        currency: {
          style: 'currency',
          currency: 'PLN',
          notation: 'standard'
        },
        decimal: {
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      },
      // EUR support (can be used with any locale)
      eur: {
        currency: {
          style: 'currency',
          currency: 'EUR',
          notation: 'standard'
        },
        decimal: {
          style: 'decimal',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }
      }
    }
  },
  
  // Runtime config for API base URL
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000'
    }
  },
  
  // App configuration
  app: {
    head: {
      title: 'E-commerce Store',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Modern e-commerce platform' }
      ]
    }
  }
})
