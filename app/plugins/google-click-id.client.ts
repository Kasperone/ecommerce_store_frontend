/**
 * Google Ads click-id capture (forward-useful for Pillar F), client-only.
 *
 * Captures `?gclid` / `?gbraid` / `?wbraid` from any landing URL into a
 * first-party cookie (`ads_click_id`, 90 days) so a future server-side offline
 * conversion upload (Pillar F, BE-coordinated, deferred) can attribute the
 * eventual payment. Harmless and out-of-scope-safe: it does NOT touch the
 * order-create payload or the backend — purely a cookie capture.
 *
 * Gated on MARKETING consent (the Ads/`ad_storage` axis): we only persist the
 * click id once the shopper has granted marketing cookies. Before that, nothing
 * is written (Consent Mode's `url_passthrough` would carry it through if/when
 * tags need it). Re-checks on consent changes so a later "accept" still captures
 * an id present in the current URL.
 */
const CLICK_ID_COOKIE = 'ads_click_id'
const CLICK_PARAMS = ['gclid', 'gbraid', 'wbraid'] as const

export default defineNuxtPlugin(() => {
  const { hasDecided, categories } = useCookieConsent()
  const cookie = useCookie<string | null>(CLICK_ID_COOKIE, {
    default: () => null,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  })

  function capture() {
    // Only with marketing consent; never overwrite an already-captured id.
    if (!hasDecided.value || !categories.value.marketing || cookie.value) return
    const params = new URLSearchParams(window.location.search)
    for (const key of CLICK_PARAMS) {
      const val = params.get(key)
      if (val) {
        cookie.value = `${key}:${val}`
        return
      }
    }
  }

  // Run once on load + whenever marketing consent flips on.
  watch(() => [hasDecided.value, categories.value.marketing], capture, { immediate: true })
})
