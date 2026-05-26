// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useCurrencyPreference } from './useCurrencyPreference'

/**
 * The composable is a thin wrapper over `useCookie` + the pure
 * `defaultCurrencyForLocale` (covered in money.spec.ts). Here we mock the
 * framework auto-imports to assert the wiring: the cookie default is derived
 * from the locale, and `setCurrency` writes through the ref.
 */

const { localeRef, cookieRef, capturedOptions } = vi.hoisted(() => ({
  localeRef: { value: 'en' },
  cookieRef: { value: undefined as string | undefined },
  capturedOptions: { value: undefined as { default?: () => string } | undefined },
}))

mockNuxtImport('useI18n', () => () => ({ locale: localeRef }))
mockNuxtImport('useCookie', () => (_key: string, opts: { default?: () => string }) => {
  capturedOptions.value = opts
  // Emulate useCookie: when no cookie is present, seed from default().
  if (cookieRef.value === undefined && opts?.default) cookieRef.value = opts.default()
  return cookieRef
})

beforeEach(() => {
  localeRef.value = 'en'
  cookieRef.value = undefined
  capturedOptions.value = undefined
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
})
