// https://nuxt.com/docs/api/configuration/nuxt-config
import { createResolver } from '@nuxt/kit'

const { resolve } = createResolver(import.meta.url)

export default defineNuxtConfig({

  // ORDER MATTERS: @nuxtjs/i18n MUST come before @nuxtjs/seo — nuxt-site-config
  // reads i18n's baseUrl/locales at module setup (nuxtseo.com/docs/site-config/guides/i18n).
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/scripts',
    '@nuxt/ui',
    '@pinia/nuxt',
    '@nuxtjs/i18n',
    '@nuxtjs/seo',
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

  // nuxt-site-config (consumed by every Nuxt SEO module). `url` + `name` are
  // REQUIRED (site-config v4 removed implicit inference) — without `url` no
  // absolute canonical/hreflang/sitemap/og URLs can be generated. Both are
  // env-overridable per environment (NUXT_PUBLIC_SITE_URL / NUXT_SITE_NAME);
  // the production domain is TBD at deploy. NUXT_SITE_ENV != 'production'
  // auto-serves a disallow-all robots.txt + global noindex (staging safety).
  site: {
    url: 'https://store.example.com',
    name: 'E-commerce Store',
  },

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
      // Google Analytics 4 + Google Ads tags (Pillars B–D). All PUBLIC by design
      // — gtag/Ads/Merchant IDs ship to the client and are not secret. Empty
      // defaults make every tag a no-op (mirrors `apiBase: ''`): with no `ga4Id`
      // nothing loads, no events fire, and the app behaves exactly as before.
      // Env override: NUXT_PUBLIC_GA4_ID / _ADS_ID / _ADS_PURCHASE_LABEL / _MERCHANT_ID.
      ga4Id: '', // GA4 measurement id, e.g. 'G-XXXXXXXX'
      adsId: '', // Google Ads conversion id, e.g. 'AW-XXXXXXXXX'
      adsPurchaseLabel: '', // the Ads purchase conversion-action label
      merchantId: '', // Merchant Center account id (cart-data on the conversion)
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
    // NO response caching on the homepage (or any cookie/auth-aware SSR route).
    // The previous `isr: 3600` rules were removed (SEO blueprint D8): Nitro's
    // cached handlers key on path+query only — request headers are dropped and
    // the FIRST response's headers (incl. `Set-Cookie: i18n_redirected/currency`
    // and any auth-aware header chrome in the HTML) would be cached and replayed
    // to every user for an hour. Verified live: `/` emits two Set-Cookie headers.
    // Same reasoning as the existing note below about not ISR-caching the CMS
    // catch-all: revisit only once SSR output is cookie-independent.
    //
    // NOTE: the catch-all CMS route ([...slug].vue) lives at the URL ROOT, so we
    // deliberately do NOT add a blanket `'/**': { isr }` rule — that would also
    // ISR-cache authed/dynamic routes (`/account`, `/cart`, `/checkout`, …) and
    // leak one user's rendered HTML to the next. CMS catch-all pages are served
    // SSR (fast + fully SEO-indexable); per-page ISR can be added once pages
    // carry a distinguishing prefix or a render-time cache tag (§6.5 purge).
    // Draft preview routes must always reflect the latest unpublished layout, so
    // they are NEVER cached (research §6.2/§6.5). Covers the documented preview
    // path shapes; the admin editor itself is auth-gated and uncached by default.
    '/preview/**': { isr: false, robots: false },
    '/pl/preview/**': { isr: false, robots: false },
    // Static/legal pages: prerender at build time, BOTH locale paths (each is
    // its own route — SEO blueprint SEO-0.4/D8). Content is i18n-static; the
    // header/footer chrome (store-config) is empty-safe if the backend is
    // unreachable during build, and auth/cart state hydrates client-side.
    // Prerender only runs in `nuxt build` — dev + the E2E job (dev server)
    // are unaffected. Catalog/home stay plain SSR (no swr — see above).
    '/about': { prerender: true },
    '/pl/about': { prerender: true },
    '/accessibility': { prerender: true },
    '/pl/accessibility': { prerender: true },
    '/contact': { prerender: true },
    '/pl/contact': { prerender: true },
    '/cookie-policy': { prerender: true },
    '/pl/cookie-policy': { prerender: true },
    '/faq': { prerender: true },
    '/pl/faq': { prerender: true },
    '/privacy-policy': { prerender: true },
    '/pl/privacy-policy': { prerender: true },
    '/returns': { prerender: true },
    '/pl/returns': { prerender: true },
    '/shipping-returns': { prerender: true },
    '/pl/shipping-returns': { prerender: true },
    '/terms-of-service': { prerender: true },
    '/pl/terms-of-service': { prerender: true },
    // Noindex for authed/transactional/thin sections (SEO blueprint D5).
    // `robots: false` emits an X-Robots-Tag header (SSR) + <meta name="robots">
    // — index control on top of the crawl control in `robots.groups` below
    // (robots.txt alone doesn't deindex). Localized /pl twins are separate paths.
    '/admin/**': { robots: false },
    '/account/**': { robots: false },
    '/pl/account/**': { robots: false },
    '/cart': { robots: false },
    '/pl/cart': { robots: false },
    '/checkout': { robots: false },
    '/checkout/**': { robots: false },
    '/pl/checkout': { robots: false },
    '/pl/checkout/**': { robots: false },
    // Guest order tracking — token-bearing URLs must never be indexed.
    '/orders/track/**': { robots: false },
    '/pl/orders/track/**': { robots: false },
    '/search': { robots: false },
    '/pl/search': { robots: false },
    '/login': { robots: false },
    '/pl/login': { robots: false },
    '/sign-up': { robots: false },
    '/pl/sign-up': { robots: false },
    '/password-recovery': { robots: false },
    '/pl/password-recovery': { robots: false },
    '/password-reset/**': { robots: false },
    '/pl/password-reset/**': { robots: false },
    '/verify-email/**': { robots: false },
    '/pl/verify-email/**': { robots: false },
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
    // REQUIRED for fully-qualified hreflang/canonical alternates emitted by
    // useLocaleHead (i18n.nuxtjs.org/docs/guide/seo). Must match site.url;
    // env-overridable via NUXT_PUBLIC_I18N_BASE_URL at deploy.
    baseUrl: 'https://store.example.com',
    locales: [
      {
        code: 'en',
        language: 'en-US',
        name: 'English',
        files: ['en/common.json', 'en/home.json', 'en/product.json', 'en/cart.json', 'en/legal.json', 'en/cookies.json', 'en/blocks.json'],
      },
      {
        code: 'pl',
        language: 'pl-PL',
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

  // @nuxt/image — responsive srcset + lazy + format negotiation for the
  // R2-hosted catalog/CMS images (Nuxt-4 FE audit P1). Uses the default IPX
  // provider (built-in, no external CDN dependency) and allowlists the public
  // R2 bucket domain so remote R2 URLs are optimizable. R2 `.dev` URLs have no
  // native image transform, so IPX proxies + resizes them server-side. The CMS
  // image picker writes these R2 URLs; <NuxtImg> renders them through here.
  image: {
    // Allowlist the public R2 bucket so its remote URLs may be optimized.
    domains: ['pub-7dea48929d9848c0bd7f859e5e4e9484.r2.dev'],
    // Sensible responsive breakpoints for full-bleed hero/slideshow + grids.
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536,
    },
  },

  // nuxt-og-image — deferred (blueprint D9): og:image is the real R2 product
  // photo / category hero via useSeoMeta, plus a static share image fallback;
  // no generated-card runtime needed.
  ogImage: { enabled: false },

  // @nuxtjs/robots — replaces the deleted public/robots.txt (the module must own
  // the route to inject the Sitemap: line). Crawl-control mirror of the
  // routeRules noindex set above. AI policy (blueprint D5): allow every
  // reputable bot — search-class bots (OAI-SearchBot, Claude-SearchBot,
  // PerplexityBot, Bingbot, Googlebot) power AI answers, user-fetch agents are
  // the last hop before a sale, training bots are acceptable brand-priming —
  // and block only the abusive Bytespider. The sitemap module auto-appends the
  // Sitemap: line once it ships.
  robots: {
    groups: [
      {
        userAgent: '*',
        // The module is i18n-aware and auto-generates the /pl/ twins — listing
        // them here would duplicate every line (verified against the output).
        disallow: [
          '/admin', '/account', '/cart', '/checkout', '/search',
          '/orders/track',
          '/login', '/sign-up', '/password-recovery', '/password-reset',
          '/verify-email', '/api/',
        ],
        // Explicit machine-readable allow signals for AI use (voluntary-compliance):
        // Cloudflare Content-Signal + IETF Content-Usage directives.
        contentSignal: { 'search': 'yes', 'ai-input': 'yes', 'ai-train': 'yes' },
        contentUsage: { 'bots': 'y', 'search': 'y', 'ai-output': 'y', 'train-ai': 'y' },
      },
      { userAgent: ['Bytespider'], disallow: ['/'] },
    ],
  },

  // nuxt-seo-utils — canonical query whitelist. Overriding REPLACES the default
  // list (page/sort/filter/search/q/category/tag): keep ONLY `?page` so faceted
  // /filtered/sorted views canonicalize to the clean listing while paginated
  // pages stay self-canonical (blueprint D3 — never canonicalize page N → 1).
  seo: {
    canonicalQueryWhitelist: ['page'],
  },

  // @nuxtjs/sitemap — dynamic product/category URLs come from the Nitro
  // source endpoint (server/api/__sitemap__/urls.ts → backend slim sitemap
  // endpoints). With i18n present the module auto-emits sitemap_index.xml +
  // one sitemap per locale with hreflang alternates. Static app routes are
  // auto-discovered; the D5 noindex sections are already excluded via their
  // `robots: false` routeRules (verified) — no manual exclude list needed.
  // Real `lastmod` only (changefreq/priority are dead). Output cached
  // server-side; the backend source is hit at most once per TTL.
  sitemap: {
    sources: ['/api/__sitemap__/urls'],
    cacheMaxAgeSeconds: 600,
  },
})
