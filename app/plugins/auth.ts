/**
 * Auth Plugin
 * Initializes user session on app startup if auth token exists
 */
export default defineNuxtPlugin(async (nuxtApp) => {
  const authStore = useAuthStore()

  // Only fetch user on client side after hydration
  if (import.meta.client) {
    // If we have a token, try to fetch user info
    if (authStore.authToken) {
      try {
        await authStore.fetchUser()
      } catch (error) {
        // Silent fail - user will be logged out if token is invalid
        console.error('Failed to restore user session:', error)
      }
    }
  }
})
