// Phase 2 of the account-panel redesign flattened the settings routes:
// `/account/settings/<x>` → `/account/<x>` and the menu-only hub
// `/account/settings` → `/account`. This middleware permanently (301) redirects
// the old paths so existing bookmarks, emails, and search-engine links keep
// working. Mounted on the two leftover stub pages under `account/settings/`.
//
// We string-replace on `to.path` rather than rebuilding via `localePath` so any
// i18n locale prefix is preserved automatically (`/pl/account/settings/profile`
// → `/pl/account/profile`). Query + hash are carried over. The 301 is emitted
// server-side on a hard load (the SEO-meaningful case); on in-app navigation it
// is a normal client redirect.
export default defineNuxtRouteMiddleware((to) => {
  const target = to.path.replace('/account/settings', '/account') || '/account'
  return navigateTo(
    { path: target, query: to.query, hash: to.hash },
    { redirectCode: 301 },
  )
})
