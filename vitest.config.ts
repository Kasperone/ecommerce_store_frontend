import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Default to happy-dom for fast unit tests; tests that need the Nuxt
    // runtime opt in via `// @vitest-environment nuxt` at the top of the file.
    environment: 'happy-dom',
    environmentOptions: {
      nuxt: {
        overrides: {
          // nuxt-seo-utils' automatic-defaults plugin computes a canonical from
          // `route.query`; specs that partial-mock useRouter/useRoute leave
          // `query` undefined, which throws an async "Cannot convert undefined
          // or null to object" AFTER the suite finishes — Vitest then fails an
          // all-green run on unhandled errors (CI-only flake). Unit tests don't
          // assert canonicals (that's curl/E2E territory), so drop the plugin
          // in the test env only; production config is untouched.
          seo: { automaticDefaults: false },
        },
      },
    },
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: [
      'shared/**/*.spec.ts',
      'app/**/*.spec.ts',
      'test/**/*.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'shared/**/*.ts',
        'app/composables/**/*.ts',
        'app/stores/**/*.ts',
        'app/middleware/**/*.ts',
        'app/utils/**/*.ts',
      ],
      exclude: [
        '**/*.spec.ts',
        '**/*.d.ts',
      ],
    },
  },
})
