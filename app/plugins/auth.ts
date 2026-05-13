/**
 * Auth Plugin
 *
 * Runs on both server and client. On SSR it forwards the incoming Cookie
 * header to /auth/refresh and replays the rotated Set-Cookie back to the
 * browser — that's what lets route middleware know who the visitor is
 * before the page renders, eliminating the flash-of-forbidden-content
 * problem on hard reloads.
 *
 * On client (after hydration) tryRestoreSession is a no-op because the
 * SSR pass already flipped sessionRestoreAttempted; we just re-arm the
 * proactive-refresh setTimeout that can't run on the server.
 */
export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore()
  await authStore.tryRestoreSession()
  if (import.meta.client) authStore.armClientTimer()
})
