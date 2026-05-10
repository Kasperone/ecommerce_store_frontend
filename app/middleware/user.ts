// UX-only: redirects unauthenticated visitors to login. Real authorization
// lives on the backend — every account API call is re-checked against the JWT
// (`get_current_user` dependency). Never rely on this middleware as the
// security boundary.
export default defineNuxtRouteMiddleware(async (to) => {
  // SSR cannot know auth state: the refresh cookie is path-scoped to
  // /api/v1/auth and is not sent for app routes. Defer the decision to the
  // client where the auth plugin's tryRestoreSession runs.
  if (import.meta.server) return

  const authStore = useAuthStore()

  // On hard reload the plugin's tryRestoreSession may still be in flight;
  // racing against it would redirect a logged-in user to /login. Await the
  // first attempt before deciding.
  if (!authStore.sessionRestoreAttempted) {
    await authStore.tryRestoreSession()
  }

  if (!authStore.isAuthenticated) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
