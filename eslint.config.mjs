// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import vitest from 'eslint-plugin-vitest'

// Translation-key subtrees that `no-unused-keys` cannot statically verify and
// so must NOT flag as unused. The rule only detects static-literal arguments
// to t()/$t()/tc(); these subtrees are reached through indirection it can't
// trace:
//   • dynamic enum lookups   — t(`orders.status.${s}`)
//   • LegalSection body-key   — `tm('legal.cookies.sections.x.body')` renders
//                               the paragraph array (so …body[0]/[1] look unused)
//   • config-driven arrays    — footer/nav { to, labelKey } then t(labelKey)
//   • Zod validator messages  — error keys stored as bare strings, t()'d later
// Empirically derived (597 flagged → 122 truly dead, FE #276; the rest live).
// Regenerate via the audit method in
// notes/plans/test/to-fix/2026-05-15-i18n-key-backlog-frontend.md.
const i18nDynamicKeyIgnores = [
  // account
  '/^account\\.nav\\./',
  '/^account\\.overview\\.completeness\\./',
  '/^account\\.quotes\\.status\\./',
  '/^account\\.settings\\.addresses\\.errors\\./',
  '/^account\\.settings\\.company\\.errors\\./',
  '/^account\\.settings\\.company\\.fields\\./',
  '/^account\\.settings\\.company\\.status\\./',
  '/^account\\.settings\\.nav\\./',
  '/^account\\.settings\\.preferences\\.communications\\./',
  '/^account\\.settings\\.team\\.actions\\./',
  '/^account\\.settings\\.team\\.confirm\\./',
  '/^account\\.settings\\.team\\.roles\\./',
  '/^account\\.settings\\.team\\.statuses\\./',
  // admin
  '/^admin\\.auditLog\\.actions\\./',
  '/^admin\\.auditLog\\.resources\\./',
  '/^admin\\.banners\\.placement\\./',
  '/^admin\\.campaigns\\.audience\\./',
  '/^admin\\.campaigns\\.status\\./',
  '/^admin\\.cms\\.pageType\\./',
  '/^admin\\.cms\\.status\\./',
  '/^admin\\.cms\\.subBlocks\\./',
  '/^admin\\.companies\\.status\\./',
  '/^admin\\.coupons\\.discountType\\./',
  '/^admin\\.customers\\.flashes\\./',
  '/^admin\\.customers\\.roles\\./',
  '/^admin\\.inventory\\.lowStock\\.report\\./',
  '/^admin\\.inventory\\.reasons\\./',
  '/^admin\\.inventory\\.status\\./',
  '/^admin\\.menu\\.groups\\./',
  '/^admin\\.menu\\.items\\./',
  '/^admin\\.orders\\.refund\\.reasonOptions\\./',
  '/^admin\\.orders\\.status\\./',
  '/^admin\\.products\\.csv\\.import\\.actions\\./',
  '/^admin\\.products\\.variants\\.errors\\./',
  '/^admin\\.quotes\\.status\\./',
  '/^admin\\.returns\\.actionModal\\./',
  '/^admin\\.returns\\.flashes\\./',
  '/^admin\\.returns\\.reasonOptions\\./',
  '/^admin\\.returns\\.status\\./',
  '/^admin\\.reviews\\.flashes\\./',
  '/^admin\\.reviews\\.status\\./',
  '/^admin\\.segments\\.role\\./',
  '/^admin\\.segments\\.tagMatch\\./',
  '/^admin\\.shipping\\.rates\\.pricingKind\\./',
  // checkout
  '/^checkout\\.errors\\./',
  // errorPage (error.vue dynamic lookup)
  '/^errorPage\\./',
  // footer (config-driven columns + social arrays)
  '/^footer\\.columns\\./',
  '/^footer\\.social\\./',
  // legal (LegalSection dynamic + body-key array rendering)
  '/^legal\\.about\\.sections\\./',
  '/^legal\\.accessibility\\.sections\\./',
  '/^legal\\.contact\\.form\\.errors\\./',
  '/^legal\\.cookies\\.sections\\./',
  '/^legal\\.faq\\.items\\./',
  '/^legal\\.privacy\\.sections\\./',
  '/^legal\\.returns\\.sections\\./',
  '/^legal\\.shipping\\.sections\\./',
  '/^legal\\.terms\\.sections\\./',
  // orders
  '/^orders\\.refund\\.reasonOptions\\./',
  '/^orders\\.returns\\.reasonOptions\\./',
  '/^orders\\.returns\\.status\\./',
  '/^orders\\.status\\./',
  // reviews
  '/^reviews\\.form\\.errors\\./',
  '/^reviews\\.status\\./',
]

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
      'shared/types/api.gen.ts',
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
      // The codebase is TypeScript-heavy, so `.ts` MUST be in extensions
      // (the rule defaults to ['.js', '.vue'] and otherwise misses every key
      // used only from a composable/store/validator). `ignores` covers the
      // keys reached via indirection the rule can't resolve — see the
      // i18nDynamicKeyIgnores definition above.
      '@intlify/vue-i18n/no-unused-keys': ['warn', {
        extensions: ['.js', '.ts', '.vue'],
        ignores: i18nDynamicKeyIgnores,
      }],
      '@intlify/vue-i18n/key-format-style': ['warn', 'camelCase'],
    },
  },

  // Some locale keys deliberately mirror backend enum values (inventory
  // status `in_stock`/`low_stock`/`out_of_stock`, movement `reasons`, user
  // `roles` CUSTOMER/ADMIN) so they resolve via dynamic
  // `$t(`…${enumValue}`)` lookups — they must match the API verbatim and so
  // can't be camelCase. Turn off key-format-style for locale resources only;
  // no-unused-keys / no-missing-keys stay on, and camelCase is still the
  // convention for hand-authored keys (enforced by review).
  {
    name: 'ecommerce-store/vue-i18n-locale-keys',
    files: ['i18n/locales/**/*.json'],
    rules: {
      '@intlify/vue-i18n/key-format-style': 'off',
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
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // NB: this block must stay AFTER ecommerce-store/rules so its rule
  // overrides take precedence (flat config: later configs win on shared
  // rules when multiple files-patterns match).
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
