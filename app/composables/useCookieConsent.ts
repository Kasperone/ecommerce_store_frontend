import type { components } from '#shared/types/api.gen'

type CookieConsentCategories = components['schemas']['CookieConsentCategories']
type CookieConsentRequest = components['schemas']['CookieConsentRequest']
type CookieConsentResponse = components['schemas']['CookieConsentResponse']

/** Mutable, consent-able categories (everything except always-on `necessary`). */
export type ConsentCategory = 'analytics' | 'marketing'

/** The cookie-policy version currently in force. Bump when the policy changes so
 * a stored decision is treated as stale and the banner re-shows. */
export const COOKIE_POLICY_VERSION = '2026-06-05'

const ANON_ID_COOKIE = 'cookie_anon_id'
const CONSENT_COOKIE = 'cookie_consent'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

/** Shape persisted in the `cookie_consent` cookie. */
interface StoredConsent {
  categories: CookieConsentCategories
  gpc: boolean
  policy_version: string
}

function fullCategories(analytics: boolean, marketing: boolean): CookieConsentCategories {
  return { necessary: true, analytics, marketing }
}

/**
 * Cookie-consent state + actions, shared across the banner and the footer
 * "Cookie settings" control.
 *
 * Design:
 * - State lives in module-scoped `ref`s created via `useState` so SSR
 *   serialization is handled and every caller (banner + footer) sees one
 *   instance.
 * - `anon_id` is a long-lived `useCookie` (UUID) identifying a guest visitor.
 * - **Global Privacy Control** (`navigator.globalPrivacyControl`) is read
 *   client-only; when true the analytics + marketing categories default OFF and
 *   `gpc: true` is sent to the backend.
 * - `hasDecided` is derived from the presence of a valid (current-policy)
 *   `cookie_consent` cookie. `save()` POSTs to `/cookie-consent` and writes that
 *   cookie so the banner doesn't re-show.
 * - `necessary` is always true and never user-toggleable.
 *
 * SSR-safety: `navigator`/`crypto`/`window` are only touched inside
 * `import.meta.client` guards (or lazily via `onMounted`-time reads), so the
 * server render is deterministic.
 */
export function useCookieConsent() {
  const anonId = useCookie<string | null>(ANON_ID_COOKIE, {
    default: () => null,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  const consentCookie = useCookie<StoredConsent | null>(CONSENT_COOKIE, {
    default: () => null,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  // GPC is a client-only signal; on the server it stays false so the render is
  // deterministic. Resolved once on the client during composable setup.
  const gpc = useState<boolean>('cookie-consent:gpc', () => false)
  if (import.meta.client && navigator?.globalPrivacyControl === true) {
    gpc.value = true
  }

  // Whether a current-policy decision is already stored. Stale-policy decisions
  // (older policy_version) are treated as undecided so the banner re-shows.
  const hasDecided = useState<boolean>('cookie-consent:hasDecided', () => {
    const stored = consentCookie.value
    return stored != null && stored.policy_version === COOKIE_POLICY_VERSION
  })

  // Manage-panel / banner open state (used for re-opening after a decision).
  const isOpen = useState<boolean>('cookie-consent:isOpen', () => false)

  // Working copy of the toggleable categories. Seeded from a stored decision if
  // present, else from GPC (GPC true → non-essential default off).
  const categories = useState<CookieConsentCategories>('cookie-consent:categories', () => {
    const stored = consentCookie.value
    if (stored && stored.policy_version === COOKIE_POLICY_VERSION) {
      return fullCategories(stored.categories.analytics, stored.categories.marketing)
    }
    // No (current) decision yet: GPC true → default analytics + marketing off.
    return fullCategories(false, false)
  })

  const { apiFetch } = useApi()

  /** Lazily mint + persist the anonymous visitor id (client-only `crypto`). */
  function ensureAnonId(): string | null {
    if (anonId.value) return anonId.value
    if (import.meta.client && typeof crypto?.randomUUID === 'function') {
      anonId.value = crypto.randomUUID()
    }
    return anonId.value
  }

  /**
   * Persist a decision: POST to the backend (best-effort) and write the
   * `cookie_consent` cookie so the banner doesn't re-show. `necessary` is
   * forced true regardless of the input.
   */
  async function save(next: Partial<Pick<CookieConsentCategories, ConsentCategory>> = {}) {
    const resolved = fullCategories(
      next.analytics ?? categories.value.analytics,
      next.marketing ?? categories.value.marketing,
    )
    categories.value = resolved

    const id = ensureAnonId()

    const stored: StoredConsent = {
      categories: resolved,
      gpc: gpc.value,
      policy_version: COOKIE_POLICY_VERSION,
    }
    // Write the cookie first so the decision sticks even if the POST fails.
    consentCookie.value = stored
    hasDecided.value = true
    isOpen.value = false

    const payload: CookieConsentRequest = {
      anon_id: id,
      categories: resolved,
      gpc: gpc.value,
      policy_version: COOKIE_POLICY_VERSION,
    }

    try {
      await apiFetch<CookieConsentResponse>('/api/v1/cookie-consent', {
        method: 'POST',
        body: payload,
      })
    }
    catch {
      // Best-effort: the cookie already records the choice locally. Recording
      // server-side is non-blocking for the storefront experience.
    }
  }

  /** Accept all categories. */
  async function acceptAll() {
    await save({ analytics: true, marketing: true })
  }

  /** Reject all non-essential categories (necessary stays on). */
  async function rejectAll() {
    await save({ analytics: false, marketing: false })
  }

  /** Re-open the banner / manage panel (footer "Cookie settings"). Seeds the
   * working copy from the stored decision so toggles reflect the saved state. */
  function openSettings() {
    const stored = consentCookie.value
    if (stored && stored.policy_version === COOKIE_POLICY_VERSION) {
      categories.value = fullCategories(stored.categories.analytics, stored.categories.marketing)
    }
    isOpen.value = true
  }

  /** Close the panel without saving. Only meaningful once a decision exists. */
  function close() {
    isOpen.value = false
  }

  return {
    categories,
    hasDecided,
    isOpen,
    gpc,
    openSettings,
    close,
    acceptAll,
    rejectAll,
    save,
    policyVersion: COOKIE_POLICY_VERSION,
  }
}
