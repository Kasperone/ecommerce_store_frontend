/**
 * Manual GA4 `page_view` on SPA navigation (Pillar C #9), client-only.
 *
 * GA4 is configured with `send_page_view: false` (see `useGoogleTags`) because
 * a Nuxt SPA never reloads gtag.js between route changes — the automatic
 * page_view only fires once on the hard load, undercounting every subsequent
 * client navigation. We emit `page_view` ourselves on `router.afterEach`.
 *
 * The FIRST navigation (initial load) is skipped: gtag's own `config` already
 * registers the landing page in modeled/cookieless mode, so emitting here too
 * would double-count the entry page. We start counting from the first in-app
 * navigation onward.
 *
 * `gtag` is a buffering noop until consent/load; Consent Mode gates whether the
 * hit is cookied or modeled. No-op entirely when `ga4Id` is unconfigured.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const { gtag, enabled } = useGoogleTags()
  if (!enabled) return

  const router = useRouter()
  let first = true

  router.afterEach((to) => {
    if (first) {
      first = false
      return
    }
    nuxtApp.runWithContext(() => {
      gtag('event', 'page_view', {
        page_path: to.fullPath,
        page_location: import.meta.client ? window.location.href : undefined,
        page_title: import.meta.client ? document.title : undefined,
      })
    })
  })
})
