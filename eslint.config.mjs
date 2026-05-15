// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import vitest from 'eslint-plugin-vitest'

export default withNuxt(
  {
    name: 'ecommerce-store/ignores',
    ignores: [
      '.nuxt/**',
      '.output/**',
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'playwright/.auth/**',
      'playwright/.mcp-output/**',
      'playwright/.test-results/**',
      'i18n/.cache/**',
    ],
  },

  ...vueI18n.configs.base,

  {
    name: 'ecommerce-store/vue-i18n',
    settings: {
      'vue-i18n': {
        localeDir: './i18n/locales/{en,pl}/*.json',
        messageSyntaxVersion: '^11.0.0',
      },
    },
    rules: {
      '@intlify/vue-i18n/no-missing-keys': 'warn',
      '@intlify/vue-i18n/no-unused-keys': 'warn',
      '@intlify/vue-i18n/key-format-style': ['warn', 'camelCase'],
    },
  },

  {
    name: 'ecommerce-store/vitest',
    files: [
      '**/*.spec.ts',
      'test/**/*.ts',
      'e2e/**/*.ts',
    ],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    name: 'ecommerce-store/rules',
    files: ['**/*.{js,mjs,ts,vue}'],
    rules: {
      '@stylistic/max-len': ['warn', {
        code: 100,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
        ignoreComments: false,
      }],
      // Demoted to warn: i18n t() option params and $fetch error catches
      // intentionally use `any`. Tightening to `unknown` + narrowing tracked
      // in notes/plans/test/to-fix/typescript-any-tightening-frontend.md.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  {
    name: 'ecommerce-store/type-aware',
    files: [
      'app/composables/**/*.ts',
      'app/stores/**/*.ts',
      'shared/**/*.ts',
    ],
    ignores: ['**/*.spec.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
)
