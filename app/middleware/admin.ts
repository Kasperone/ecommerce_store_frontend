// UX-only: hides admin routes from non-admins and avoids a flash of forbidden
// content. Real authorization lives on the backend (`get_current_admin`
// dependency) — every admin API call is re-checked there. Never rely on this
// middleware as the security boundary.
export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  if (!authStore.isAdmin) {
    return navigateTo('/')
  }
})
