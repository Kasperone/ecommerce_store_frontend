// https://nuxt.com/docs/api/configuration/nuxt-config
import { createResolver } from '@nuxt/kit'

const { resolve } = createResolver(import.meta.url)

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
      'utils/**'
    ]
  },
  
  // Alias configuration for shared directory
  alias: {
    '#shared': resolve('./shared')
  },
  
  // Vite configuration
  vite: {
    resolve: {
      alias: {
        '#shared': resolve('./shared')
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
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root',
    }
  },
  
  // Runtime config for API base URL
  // Environment variables prefixed with NUXT_PUBLIC_ are automatically available
  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:8000'
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
