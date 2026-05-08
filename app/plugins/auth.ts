/**
 * Auth Plugin
 *
 * On boot (client only), try to recover a session via the refresh cookie.
 * The cookie is HttpOnly, so we can't read it directly — we just POST to
 * /auth/refresh and let the browser send it. On 200 we get a fresh access
 * token in memory and load the user. On 401 we stay logged out silently.
 */
export default defineNuxtPlugin(async () => {
  if (!import.meta.client) return
  const authStore = useAuthStore()
  await authStore.tryRestoreSession()
})
