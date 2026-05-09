import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // Default to happy-dom for fast unit tests; tests that need the Nuxt
    // runtime opt in via `// @vitest-environment nuxt` at the top of the file.
    environment: 'happy-dom',
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
