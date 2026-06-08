import { watch } from 'vue'
import { toGcm } from '#shared/utils/consentMode'

/**
 * Consent-Mode v2 bridge (Pillar A-bridge), client-only.
 *
 * The cookie-consent layer (`useCookieConsent`) is the source of truth for tag
 * gating. This plugin wires its decisions to the gtag `consent('update')` so
 * Google's denied-by-default (registered in `useGoogleTags`) flips to the
 * shopper's actual choice whenever a decision is saved (accept/reject/save) —
 * including re-opening the footer "Cookie settings" and changing toggles.
 *
 * Why a plugin + watcher (vs calling update inside the banner): the banner is
 * one of several entry points (footer link, GPC), and a returning visitor with
 * a stored decision never re-renders the banner at all — but their stored
 * consent must STILL be replayed to gtag on every page load. A single watcher
 * over the shared `useCookieConsent` state covers all of these uniformly.
 *
 * Ordering: `useGoogleTags()` registers the `consent('default', denied)` at
 * composable init (synchronously pushed onto the dataLayer); the update here
 * always runs after, so the denied default is in place first. When analytics
 * is unconfigured, `consentUpdate` is a safe no-op.
 *
 * No-op when `ga4Id` is empty (tags disabled) — we still set up the watcher so
 * turning analytics on later needs no code path change, but every update call
 * is a noop.
 */
export default defineNuxtPlugin(() => {
  const { hasDecided, categories } = useCookieConsent()
  const { consentUpdate, enabled } = useGoogleTags()

  function push() {
    // Only forward a real decision. Before the shopper decides, gtag stays at
    // the denied default (correct: cookieless/modeled mode).
    if (!hasDecided.value) return
    consentUpdate(toGcm({
      analytics: categories.value.analytics,
      marketing: categories.value.marketing,
    }))
  }

  // Replay the stored decision on load + on every subsequent change. `enabled`
  // is false when unconfigured, in which case `consentUpdate` is a noop anyway,
  // but we still register so the wiring is uniform.
  if (enabled) {
    watch(
      [hasDecided, () => categories.value.analytics, () => categories.value.marketing],
      push,
      { immediate: true },
    )
  }
})
