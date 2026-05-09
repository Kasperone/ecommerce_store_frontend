// UX-only: redirects unauthenticated visitors to login. Real authorization
// lives on the backend — every account API call is re-checked against the JWT
// (`get_current_user` dependency). Never rely on this middleware as the
// security boundary.
export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
