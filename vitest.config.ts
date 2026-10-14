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
    // Heavy `mountSuspended` specs (full-app mount, repeated per test) run ~8s
    // under v8 coverage locally and tip past Vitest's default 5s test / 10s hook
    // timeouts on slower CI runners under parallel load — an otherwise-green suite
    // then fails on a timeout, not a real assertion (hit on FE #312: the checkout
    // spec timed out at 10007ms, passed on re-run). The Nuxt environment's global
    // `beforeAll(setupNuxt)` is a hook too: on a saturated GHA runner after ~30min
    // of `test:coverage`, `app/pages/checkout/index.spec.ts` once hit "Hook timed
    // out in 20000ms" (run 38606491815) while every assertion was fine on rerun.
    // Generous headroom keeps that CI-only flake class out without masking a hang.
    testTimeout: 15000,
    hookTimeout: 60000,
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
