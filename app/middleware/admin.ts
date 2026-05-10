import { safeRedirect } from '#shared/utils/safeRedirect'

// UX-only: hides admin routes from non-admins and avoids a flash of forbidden
// content. Real authorization lives on the backend (`get_current_admin`
// dependency) — every admin API call is re-checked there. Never rely on this
// middleware as the security boundary.
export default defineNuxtRouteMiddleware(async (to) => {
  // SSR cannot know auth state: the refresh cookie is path-scoped to
  // /api/v1/auth and is not sent for app routes. Defer the decision to the
  // client where the auth plugin's tryRestoreSession runs.
  if (import.meta.server) return

  const authStore = useAuthStore()

  // On hard reload the plugin's tryRestoreSession may still be in flight;
  // racing against it would redirect a logged-in admin to /login.
  if (!authStore.sessionRestoreAttempted) {
    await authStore.tryRestoreSession()
  }

  if (!authStore.isAuthenticated) {
    const safe = safeRedirect(to.fullPath, '/')
    return navigateTo(`/login?redirect=${encodeURIComponent(safe)}`)
  }

  if (!authStore.isAdmin) {
    return navigateTo('/')
  }
})
