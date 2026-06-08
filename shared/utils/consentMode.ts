/**
 * Consent-Mode v2 bridge (Pillar A-bridge).
 *
 * The store already has a fully-built cookie-consent layer
 * (`useCookieConsent`) with three categories: `necessary`, `analytics`,
 * `marketing`. Google Consent Mode v2 speaks four signals instead. This pure
 * mapper translates our two toggleable categories into the four GCM signals so
 * the gtag denied-default + `consent('update')` bridge can fire deterministically.
 *
 * Mapping (per the integration plan §4.2 + the cookie-banner contract):
 *   - `analytics`  → `analytics_storage`      (GA4)
 *   - `marketing`  → `ad_storage`             (Google Ads cookies)
 *                  + `ad_user_data`           (Enhanced Conversions / user data)
 *                  + `ad_personalization`     (remarketing / personalized ads)
 *
 * Keeping this a dependency-free pure function makes it trivially unit-testable
 * and reusable from both the bridge plugin and any future server context.
 */

export type GcmSignal = 'granted' | 'denied'

/** Just the two user-toggleable cookie categories (necessary is always on). */
export interface ConsentCategoriesInput {
  analytics: boolean
  marketing: boolean
}

/** The four Consent-Mode v2 signals we drive. */
export interface GcmConsentSignals {
  analytics_storage: GcmSignal
  ad_storage: GcmSignal
  ad_user_data: GcmSignal
  ad_personalization: GcmSignal
}

function signal(granted: boolean): GcmSignal {
  return granted ? 'granted' : 'denied'
}

/**
 * Translate our cookie-consent categories into the four GCM v2 signals.
 * `analytics` gates analytics storage; `marketing` gates all three ad signals.
 */
export function toGcm(categories: ConsentCategoriesInput): GcmConsentSignals {
  return {
    analytics_storage: signal(categories.analytics),
    ad_storage: signal(categories.marketing),
    ad_user_data: signal(categories.marketing),
    ad_personalization: signal(categories.marketing),
  }
}
