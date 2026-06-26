import { safeRedirect } from '#shared/utils/safeRedirect'

// UX-only: hides admin routes from non-admins and avoids a flash of forbidden
// content. Real authorization lives on the backend (`get_current_admin`
// dependency) — every admin API call is re-checked there. Never rely on this
// middleware as the security boundary.
export default defineNuxtRouteMiddleware(async (to) => {
  // Runs on both server and client now that the refresh cookie is Path=/
  // and the SSR auth plugin populates the store before middleware fires.
  // See app/plugins/auth.ts.
  const authStore = useAuthStore()
  const localePath = useLocalePath()

  // On hard reload the plugin's tryRestoreSession may still be in flight;
  // racing against it would redirect a logged-in admin to /login.
  if (!authStore.sessionRestoreAttempted) {
    await authStore.tryRestoreSession()
  }

  if (!authStore.isAuthenticated) {
    const safe = safeRedirect(to.fullPath, '/')
    return navigateTo(`${localePath('/login')}?redirect=${encodeURIComponent(safe)}`)
  }

  if (!authStore.isAdmin) {
    return navigateTo(localePath('/'))
  }
})
