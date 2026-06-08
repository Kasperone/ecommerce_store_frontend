import { useScriptGoogleAnalytics } from '#imports'
import type { GcmConsentSignals } from '#shared/utils/consentMode'

/**
 * Base Google tag wrapper (Pillar B) — GA4 + Google Ads on ONE gtag, with
 * Consent-Mode v2 denied-by-default.
 *
 * Design / decisions (integration plan §5):
 * - **gtag direct** via `@nuxt/scripts` `useScriptGoogleAnalytics` (not GTM):
 *   in-repo, type-safe, performant. One gtag instance configures both the GA4
 *   `G-` property and the Ads `AW-` account.
 * - **Consent Mode v2 denied default**: all four GCM signals start `denied`
 *   with `wait_for_update: 500`, so the tag may load (cookieless/modeled mode)
 *   before the banner decision. The consent bridge (`plugins/google-consent`)
 *   flips them to granted/denied once a decision is saved.
 * - **`send_page_view: false`** — this is an SPA; we emit `page_view` ourselves
 *   on route change (see `plugins/google-page-view`) to avoid double counts.
 * - **IDs passed as composable ARGS**, not only via nuxt.config — the Nuxt-4
 *   quirk (nuxt/scripts#522) where config-only ids skip the consent callback.
 * - **No-op when unconfigured**: empty `ga4Id` => we never register the script,
 *   `gtag()` is a safe noop, and `enabled` is false. Mirrors `apiBase: ''`.
 * - **Idempotent**: one shared instance across the app; the Ads `config` runs
 *   once. `useScriptGoogleAnalytics` itself dedupes by registry key.
 *
 * Returns `{ gtag, ads, ga4, enabled }`. `gtag` is always callable (noop until
 * configured + loaded); call sites stay guard-free for crashes but should still
 * check `enabled` to avoid building event payloads pointlessly.
 */

type GtagFn = (...args: unknown[]) => void

let _adsConfigured = false

export function useGoogleTags() {
  const cfg = useRuntimeConfig().public
  const ga4Id = (cfg.ga4Id as string) || ''
  const adsId = (cfg.adsId as string) || ''

  // Unconfigured => fully no-op. Never register the script; hand back a noop
  // gtag so call sites don't need to special-case the absence of GA.
  if (!ga4Id) {
    const noop: GtagFn = () => {}
    return {
      gtag: noop,
      consentUpdate: (_state: GcmConsentSignals) => {},
      ads: adsId,
      ga4: ga4Id,
      enabled: false as const,
    }
  }

  const instance = useScriptGoogleAnalytics({
    id: ga4Id,
    // Consent Mode v2 — deny everything until the banner grants. This is pushed
    // onto the dataLayer (`gtag('consent','default', …)`) BEFORE the first
    // config/event so EEA traffic is compliant from the first byte.
    defaultConsent: {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      wait_for_update: 500,
    },
    // We own page_view on SPA route change; suppress the automatic one.
    onBeforeGtagStart: (gtag) => {
      gtag('config', ga4Id, { send_page_view: false })
      // Register the Ads account on the SAME gtag (once). Ads conversions /
      // remarketing ride this instance.
      if (adsId && !_adsConfigured) {
        gtag('config', adsId)
        _adsConfigured = true
      }
    },
  })

  // `instance.proxy.gtag` is the buffering proxy: calls made before the script
  // loads are queued and replayed on load (so events fired early aren't lost).
  const gtag: GtagFn = (...args: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(instance.proxy as any).gtag(...args)
  }

  // GCM consent bridge — `instance.consent.update(...)` forwards a
  // `gtag('consent','update', …)` once the banner decision is saved.
  function consentUpdate(state: GcmConsentSignals) {
    instance.consent?.update(state)
  }

  return {
    gtag,
    consentUpdate,
    ads: adsId,
    ga4: ga4Id,
    enabled: true as const,
  }
}
