import { CURRENCIES, defaultCurrencyForLocale } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'

const CURRENCY_COOKIE = 'currency'

/**
 * Storefront currency preference — independent of UI language.
 *
 * Backed by a cookie so the choice is stable across reloads AND identical on
 * server and client (locale is known on both, so the first-visit default is
 * deterministic — no hydration mismatch). The cookie is only written once the
 * shopper picks a currency via `setCurrency`; until then the locale default
 * (pl → PLN, else USD) is shown.
 */
export function useCurrencyPreference() {
  const { locale } = useI18n()

  const currency = useCookie<CurrencyCode>(CURRENCY_COOKIE, {
    default: () => defaultCurrencyForLocale(locale.value),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  function setCurrency(code: CurrencyCode) {
    currency.value = code
  }

  return { currency, setCurrency, currencies: CURRENCIES }
}
