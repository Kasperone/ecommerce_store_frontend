import { CURRENCIES, defaultCurrencyForLocale } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'
import { usePreferencesQuery, useUpdatePreferences } from '~/composables/queries/usePreferences'

const CURRENCY_COOKIE = 'currency'

/**
 * Storefront currency preference — independent of UI language.
 *
 * Two-layer model (D-A-5 / D-ACCT-4):
 *
 * - **Guest / SSR path** is backed by a cookie. `locale` is known on both server
 *   and client, so the first-visit default (`pl → PLN`, else USD) is identical on
 *   each — no hydration mismatch. The cookie is only written once the shopper
 *   picks a currency via `setCurrency`.
 * - **Authed path** layers the persisted `preferred_currency` on top. The read is
 *   client-only + auth-gated (Colada `enabled: () => import.meta.client && …`), so
 *   the server still renders the deterministic locale default; once the query
 *   resolves AFTER hydration we reconcile the cookie ref to the persisted value,
 *   which then WINS over the locale default. `setCurrency` persists the choice
 *   via `PATCH /me/preferences` for authed users (and always writes the cookie).
 */
export function useCurrencyPreference() {
  const { locale } = useI18n()
  const authStore = useAuthStore()

  const currency = useCookie<CurrencyCode>(CURRENCY_COOKIE, {
    default: () => defaultCurrencyForLocale(locale.value),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  // Authed-only persisted preference. Client-gated so the server/guest render
  // stays the deterministic locale default (no hydration mismatch); the gate
  // also keeps the query closed for guests so it never 401s.
  const preferences = usePreferencesQuery(() => authStore.isAuthenticated)
  const updatePreferences = useUpdatePreferences()

  // Once the client query resolves for an authed user, a persisted value
  // overrides the locale/cookie default. Runs only on the client (the query is
  // disabled on the server), so this never perturbs the SSR-hydrated value.
  watch(
    () => preferences.data.value?.preferred_currency,
    (persisted) => {
      if (persisted && persisted !== currency.value) currency.value = persisted
    },
    { immediate: true },
  )

  function setCurrency(code: CurrencyCode) {
    currency.value = code
    // Authed shoppers get the choice persisted server-side so it follows them
    // across devices/sessions; guests keep the cookie only. Best-effort — a
    // failed PATCH leaves the cookie (and this session) on the new value.
    if (import.meta.client && authStore.isAuthenticated) {
      updatePreferences.mutate({ preferred_currency: code })
    }
  }

  return { currency, setCurrency, currencies: CURRENCIES }
}
