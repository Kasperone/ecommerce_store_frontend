// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useCurrencyPreference } from './useCurrencyPreference'

/**
 * `useCurrencyPreference` is a two-layer wrapper:
 *
 * - Guest / SSR: a `useCookie` ref defaulted from the locale (`defaultCurrencyForLocale`,
 *   covered in money.spec.ts).
 * - Authed: a client-gated Colada query (`usePreferencesQuery`) whose persisted
 *   `preferred_currency` overrides the cookie default, and `setCurrency` persists
 *   the choice via the `useUpdatePreferences` mutation.
 *
 * We mock the framework auto-imports + the preferences query/mutation to assert
 * the wiring without a backend: the locale default for guests, the persisted
 * override for authed users, and the cookie write-through.
 */

const {
  localeRef,
  cookieRef,
  capturedOptions,
  authState,
  preferencesData,
  mutate,
} = vi.hoisted(() => ({
  localeRef: { value: 'en' },
  cookieRef: { value: undefined as string | undefined },
  capturedOptions: { value: undefined as { default?: () => string } | undefined },
  authState: { isAuthenticated: false },
  // Plain `{ value }` stand-in for the query's `data` ref — the composable reads
  // it once via a getter with `{ immediate: true }` and never `watch`es the raw
  // ref, so a non-reactive stand-in is safe (see the hoisted-ref testing rule).
  preferencesData: { value: undefined as { preferred_currency?: string | null } | undefined },
  mutate: vi.fn(),
}))

mockNuxtImport('useI18n', () => () => ({ locale: localeRef }))
mockNuxtImport('useCookie', () => (_key: string, opts: { default?: () => string }) => {
  capturedOptions.value = opts
  // Emulate useCookie: when no cookie is present, seed from default().
  if (cookieRef.value === undefined && opts?.default) cookieRef.value = opts.default()
  return cookieRef
})
mockNuxtImport('useAuthStore', () => () => authState)

// The composable imports these from `~/composables/queries/usePreferences` directly
// (not auto-imported), so stub the module.
vi.mock('~/composables/queries/usePreferences', () => ({
  usePreferencesQuery: () => ({ data: preferencesData }),
  useUpdatePreferences: () => ({ mutate }),
}))

beforeEach(() => {
  localeRef.value = 'en'
  cookieRef.value = undefined
  capturedOptions.value = undefined
  authState.isAuthenticated = false
  preferencesData.value = undefined
  mutate.mockClear()
})

describe('useCurrencyPreference', () => {
  it('defaults to USD for the en locale', () => {
    localeRef.value = 'en'
    expect(useCurrencyPreference().currency.value).toBe('USD')
  })

  it('defaults to PLN for the pl locale', () => {
    localeRef.value = 'pl'
    expect(useCurrencyPreference().currency.value).toBe('PLN')
  })

  it('setCurrency writes through the cookie ref', () => {
    const { currency, setCurrency } = useCurrencyPreference()
    setCurrency('EUR')
    expect(currency.value).toBe('EUR')
  })

  it('exposes the three supported currencies', () => {
    expect(useCurrencyPreference().currencies.map(c => c.code)).toEqual(['USD', 'PLN', 'EUR'])
  })

  it('guest setCurrency does not call the preferences mutation', () => {
    authState.isAuthenticated = false
    useCurrencyPreference().setCurrency('EUR')
    expect(mutate).not.toHaveBeenCalled()
  })

  it('guest with no persisted preference keeps the locale default', () => {
    // For real guests the query is disabled (auth gate in `enabled`), so its
    // data ref is undefined → the locale/cookie default stands. (The auth gate
    // itself is asserted via `usePreferencesQuery`'s `enabled` predicate; this
    // bare-call spec locks the no-data branch of the override watcher.)
    authState.isAuthenticated = false
    preferencesData.value = undefined
    localeRef.value = 'en'
    expect(useCurrencyPreference().currency.value).toBe('USD')
  })

  it('authed: a persisted preferred_currency overrides the locale default', () => {
    authState.isAuthenticated = true
    localeRef.value = 'en' // default would be USD
    preferencesData.value = { preferred_currency: 'PLN' }
    expect(useCurrencyPreference().currency.value).toBe('PLN')
  })

  it('authed setCurrency persists via the preferences mutation', () => {
    authState.isAuthenticated = true
    useCurrencyPreference().setCurrency('EUR')
    expect(mutate).toHaveBeenCalledWith({ preferred_currency: 'EUR' })
  })

  it('null persisted preference leaves the locale default in place', () => {
    authState.isAuthenticated = true
    localeRef.value = 'pl' // default PLN
    preferencesData.value = { preferred_currency: null }
    expect(useCurrencyPreference().currency.value).toBe('PLN')
  })
})
