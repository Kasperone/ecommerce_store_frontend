/**
 * Minimal i18n translate stub for unit tests.
 *
 * Returns the English fallback (`options.default`) when present, otherwise the
 * key itself. Matches the calling convention used across the frontend:
 *   t('auth.errors.invalidEmail', { default: 'Invalid email' })
 *
 * Tests assert on the resolved English copy, which is also what users see in
 * the default locale. Polish-locale assertions belong in E2E (Phase 3).
 */
export type TranslateFn = (key: string, options?: any) => string

export const tStub: TranslateFn = (key, options) => {
  if (options && typeof options === 'object' && 'default' in options) {
    return String(options.default)
  }
  return key
}
