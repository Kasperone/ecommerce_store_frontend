import { AUTH_ENDPOINTS } from '#shared/constants/api'

/**
 * Authenticated fetch wrapper.
 *
 * - Attaches `Authorization: Bearer <access>` from the in-memory store.
 * - Sends `credentials: 'include'` so the HttpOnly refresh cookie rides on
 *   /auth/refresh and /auth/logout.
 * - On a 401 response, attempts a single silent refresh and retries the
 *   original request once. If the refresh fails (or the retry also 401s),
 *   the session is cleared and the user is sent to /login.
 *
 * The auth endpoints that own the refresh cookie itself (/refresh, /logout)
 * are deliberately not routed through this wrapper — they use a plain
 * authBaseFetch in the store. This keeps the 401 retry path from re-entering
 * itself.
 */
export const useApi = () => {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()

  const baseURL = config.public.apiBase as string

  type FetchOptions = Parameters<typeof $fetch>[1]

  const buildHeaders = (existing: HeadersInit | undefined): Headers => {
    const headers = new Headers(existing || {})
    const token = authStore.accessToken
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    return headers
  }

  const apiFetch = async <T>(url: string, options: FetchOptions = {}): Promise<T> => {
    const opts: FetchOptions = {
      ...options,
      baseURL,
      credentials: 'include',
      headers: buildHeaders(options.headers as HeadersInit | undefined),
    }

    try {
      return await $fetch<T>(url, opts)
    } catch (error: any) {
      const status: number | undefined = error?.response?.status ?? error?.status
      const targetsAuthCookie = url === AUTH_ENDPOINTS.REFRESH || url === AUTH_ENDPOINTS.LOGOUT

      if (status !== 401 || targetsAuthCookie) {
        throw error
      }

      // Single silent refresh attempt. Concurrent callers share one promise.
      const refreshed = await authStore.refreshAccessToken()
      if (!refreshed) {
        // Session is gone — bounce to /login so the UI doesn't keep retrying.
        if (import.meta.client) {
          await navigateTo('/login')
        }
        throw error
      }

      // Retry once with the freshly minted access token.
      return await $fetch<T>(url, {
        ...opts,
        headers: buildHeaders(options.headers as HeadersInit | undefined),
      })
    }
  }

  return {
    apiFetch
  }
}
