import { safeRedirect } from '#shared/utils/safeRedirect'

// UX-only: hides admin routes from non-admins and avoids a flash of forbidden
// content. Real authorization lives on the backend (`get_current_admin`
// dependency) — every admin API call is re-checked there. Never rely on this
// middleware as the security boundary.
export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    const safe = safeRedirect(to.fullPath, '/')
    return navigateTo(`/login?redirect=${encodeURIComponent(safe)}`)
  }

  if (!authStore.isAdmin) {
    return navigateTo('/')
  }
})
