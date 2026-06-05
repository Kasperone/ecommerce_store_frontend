// Global Privacy Control is a non-standard `Navigator` property (not yet in the
// DOM lib types). It is set by privacy-respecting browsers/extensions to signal
// an opt-out of sale/sharing of personal data. We read it client-only to default
// non-essential cookie categories off. See `useCookieConsent`.
export {}

declare global {
  interface Navigator {
    readonly globalPrivacyControl?: boolean
  }
}
