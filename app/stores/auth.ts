import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { appendResponseHeader } from 'h3'
import { AUTH_ENDPOINTS } from '#shared/constants/api'
import type { PersonalSignUpFormData, BusinessSignUpFormData } from '#shared/validators/auth'
import type {
  UserResponse,
  TokenResponse,
  MessageResponse,
  ApiResponse,
  ImpersonationResponse,
  ImpersonatedCustomer,
} from '#shared/types/api'
import { narrowFetchError } from '~/utils/apiError'

/**
 * Auth Store
 *
 * The access token lives in memory only — the refresh cookie (HttpOnly,
 * SameSite=Strict, path=/api/v1/auth) is the only piece of credential
 * material that survives a tab close. On boot, the auth plugin calls
 * `tryRestoreSession()` which posts to /auth/refresh; the browser sends
 * the cookie automatically and we either get a fresh access token back
 * or a 401 (still logged out).
 *
 * Concurrent refresh attempts share a single in-flight promise so a
 * burst of simultaneous 401s only triggers one /refresh call.
 */
export const useAuthStore = defineStore('auth', () => {
  // State — everything is in-memory; nothing persists across reloads.
  const user = ref<UserResponse | null>(null)
  const accessToken = ref<string | null>(null)
  const accessExpiresAt = ref<number | null>(null) // epoch ms
  // True once tryRestoreSession (or login) has resolved the auth state at
  // least once. Route middleware reads this to decide whether it must await
  // the boot-time restore before redirecting an apparently-logged-out user.
  const sessionRestoreAttempted = ref(false)

  // Non-null while an admin is "viewing as" a customer. The in-memory access
  // token is then the (short-lived, view-only) impersonation token and `user`
  // reflects the customer. Ephemeral — a hard reload restores the admin via the
  // refresh cookie (impersonation is never persisted).
  const impersonating = ref<ImpersonatedCustomer | null>(null)

  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let refreshInFlight: Promise<boolean> | null = null

  const PROACTIVE_REFRESH_MS = 60_000 // refresh 60s before exp

  // Getters
  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)

  const fullName = computed(() => {
    if (!user.value) return null
    return `${user.value.first_name} ${user.value.last_name}`
  })

  const isAdmin = computed(() => user.value?.role === 'ADMIN')

  const isImpersonating = computed(() => !!impersonating.value)

  // ---- internal helpers ----

  function decodeJwtExpMs(token: string): number | null {
    try {
      const parts = token.split('.')
      if (parts.length < 2 || !parts[1]) return null
      // base64url → base64
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const json = JSON.parse(atob(b64))
      return typeof json.exp === 'number' ? json.exp * 1000 : null
    }
    catch {
      return null
    }
  }

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  function scheduleProactiveRefresh() {
    clearRefreshTimer()
    if (!import.meta.client || !accessExpiresAt.value) return
    // Impersonation tokens are short-lived and intentionally non-refreshable —
    // a /auth/refresh here would silently swap the admin's session back in.
    if (impersonating.value) return
    const delay = accessExpiresAt.value - Date.now() - PROACTIVE_REFRESH_MS
    if (delay <= 0) {
      // Already past the proactive window; refresh on next tick.
      refreshTimer = setTimeout(() => {
        void refreshAccessToken()
      }, 0)
      return
    }
    refreshTimer = setTimeout(() => {
      void refreshAccessToken()
    }, delay)
  }

  function setAccessToken(token: string | null) {
    accessToken.value = token
    accessExpiresAt.value = token ? decodeJwtExpMs(token) : null
    if (token) scheduleProactiveRefresh()
    else clearRefreshTimer()
  }

  function clearSession() {
    setAccessToken(null)
    user.value = null
    impersonating.value = null
  }

  // Direct $fetch (NOT useApi) for /auth/refresh and /auth/logout — those
  // endpoints rely on the HttpOnly cookie, not the bearer token, and routing
  // them through useApi would re-enter the 401-retry loop.
  //
  // baseURL comes from runtime config; in dev/prod it's empty so the call
  // hits the Nitro proxy at /api/v1/auth/...; tests stub the config to point
  // at an explicit URL.
  function authBaseFetch() {
    const config = useRuntimeConfig()
    return $fetch.create({
      baseURL: config.public.apiBase as string,
      credentials: 'include',
    })
  }

  // ---- actions ----

  const register = async (
    data: PersonalSignUpFormData | BusinessSignUpFormData,
    locale: 'en' | 'pl' = 'en',
  ) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<MessageResponse>(AUTH_ENDPOINTS.REGISTER, {
        method: 'POST',
        body: {
          email: data.email,
          password: data.password,
          first_name: data.firstName,
          last_name: data.lastName,
          phone: data.phone,
          // Seed the email-language preference from the UI language at signup;
          // changeable later on the account page.
          locale,
          ...('shippingStreet' in data && data.shippingStreet
            ? {
                shipping_street: data.shippingStreet,
                shipping_city: data.shippingCity,
                shipping_postal_code: data.shippingPostalCode,
                shipping_country: data.shippingCountry,
                shipping_state: data.shippingState || null,
              }
            : {}),
          ...('companyName' in data && data.companyName
            ? {
                company_name: data.companyName,
                company_tax_id: data.companyTaxId,
                company_address_street: data.companyAddressStreet,
                company_address_city: data.companyAddressCity,
                company_address_postal_code: data.companyAddressPostalCode,
                company_address_country: data.companyAddressCountry,
                company_address_state: data.companyAddressState || null,
              }
            : {}),
        },
      })

      return { success: true, data: response } as ApiResponse<MessageResponse>
    }
    catch (error) {
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail ?? 'Registration failed. Please try again.',
        raw: error,
      } as ApiResponse<MessageResponse>
    }
  }

  /**
   * B2B self-signup (Wave D / D-D-5). Posts `POST /auth/register-business`,
   * which creates the user + a `pending` company + an active COMPANY_ADMIN
   * membership in one transaction, then sends the verification email. The
   * response is anti-enumeration (always a generic 200 whether the email is
   * free or taken), so a 2xx is treated as success exactly like `register`;
   * the company-address fields the business form collects have no home on this
   * endpoint and are intentionally dropped (only name + tax id are persisted).
   */
  const registerBusiness = async (data: BusinessSignUpFormData) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<MessageResponse>(AUTH_ENDPOINTS.REGISTER_BUSINESS, {
        method: 'POST',
        body: {
          email: data.email,
          password: data.password,
          first_name: data.firstName,
          last_name: data.lastName,
          phone: data.phone || null,
          company_name: data.companyName,
          company_tax_id: data.companyTaxId || null,
        },
      })

      return { success: true, data: response } as ApiResponse<MessageResponse>
    }
    catch (error) {
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail ?? 'Registration failed. Please try again.',
        raw: error,
      } as ApiResponse<MessageResponse>
    }
  }

  const login = async (email: string, password: string) => {
    try {
      const fetcher = authBaseFetch()
      const formData = new FormData()
      formData.append('username', email)
      formData.append('password', password)

      // The login response sets the HttpOnly refresh cookie via Set-Cookie.
      // credentials: 'include' tells the browser to *accept* and *send* it.
      const response = await fetcher<TokenResponse>(AUTH_ENDPOINTS.LOGIN, {
        method: 'POST',
        body: formData,
      })

      setAccessToken(response.access_token)
      await fetchUser()
      sessionRestoreAttempted.value = true

      return { success: true, data: response } as ApiResponse<TokenResponse>
    }
    catch (error) {
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail ?? 'Login failed. Please check your credentials.',
        raw: error,
      } as ApiResponse<TokenResponse>
    }
  }

  const logout = async () => {
    // Best-effort: revoke the refresh row server-side. We don't await any
    // failure — local state is cleared regardless so the UI can move on.
    try {
      await authBaseFetch()(AUTH_ENDPOINTS.LOGOUT, { method: 'POST' })
    }
    catch {
      // ignore — server may be unreachable; we still tear down locally
    }
    clearSession()
  }

  const fetchUser = async () => {
    if (!accessToken.value) {
      user.value = null
      return
    }
    try {
      const { apiFetch } = useApi()
      user.value = await apiFetch<UserResponse>(AUTH_ENDPOINTS.ME, { method: 'GET' })
    }
    catch {
      // useApi already triggered the 401 → refresh → retry path; if we land
      // here it means even the retry failed. Tear down so the UI shows the
      // logged-out state.
      clearSession()
    }
  }

  /**
   * Hit /auth/refresh once. Concurrent callers share the same promise so a
   * burst of 401s only triggers one network round-trip.
   *
   * Server vs client paths differ because the browser cookie jar isn't
   * available on SSR — we forward the incoming Cookie header to the upstream
   * and replay the upstream's Set-Cookie back onto our outgoing response so
   * the rotated cookie reaches the browser. Without this two-way relay the
   * rotation would silently land on the Nuxt server and the browser would
   * keep replaying the old token.
   *
   * Returns true on success (access token + user are populated), false on
   * failure (session cleared).
   */
  const refreshAccessToken = async (): Promise<boolean> => {
    if (refreshInFlight) return refreshInFlight
    refreshInFlight = (async () => {
      try {
        if (import.meta.server) {
          // Capture Nuxt-context handles synchronously, BEFORE the first
          // await. Nitro's unctx-driven async context can drop after
          // `await $fetch.raw(...)`, after which `useRequestEvent`,
          // `useRuntimeConfig`, and `useApi` (transitively via
          // `useRuntimeConfig`) all throw "A composable that requires
          // access to the Nuxt instance was called outside of a plugin, …".
          // Without this hoist the outer catch silently swallows the throw
          // and clears the session — exactly the symptom of the
          // `refresh.spec.ts` post-130s hard-reload regression.
          const event = useRequestEvent()
          const incomingCookie = useRequestHeaders(['cookie']).cookie
          if (!incomingCookie || !incomingCookie.includes('refresh_token=')) {
            return false
          }
          const config = useRuntimeConfig()
          const apiBaseURL = config.public.apiBase as string

          const response = await $fetch.raw<TokenResponse>(
            AUTH_ENDPOINTS.REFRESH,
            {
              method: 'POST',
              baseURL: apiBaseURL,
              headers: { cookie: incomingCookie },
            },
          )

          const setCookies = response.headers.getSetCookie?.() ?? []
          if (event) {
            for (const cookie of setCookies) {
              appendResponseHeader(event, 'set-cookie', cookie)
            }
          }

          const body = response._data as TokenResponse | undefined
          if (!body?.access_token) {
            clearSession()
            return false
          }
          setAccessToken(body.access_token)
          if (!user.value) {
            // Inline /me fetch with the captured baseURL + freshly-issued
            // bearer. We can't reuse the regular `fetchUser` → `useApi`
            // codepath here because `useApi()` internally calls
            // `useRuntimeConfig()`, which would throw post-await for the
            // same reason `useRequestEvent` did before the hoist above.
            try {
              user.value = await $fetch<UserResponse>(AUTH_ENDPOINTS.ME, {
                method: 'GET',
                baseURL: apiBaseURL,
                headers: { Authorization: `Bearer ${body.access_token}` },
              })
            }
            catch {
              clearSession()
              return false
            }
          }
          return true
        }

        // Client: browser handles cookies; the existing authBaseFetch
        // (credentials: 'include') is all we need.
        const response = await authBaseFetch()<TokenResponse>(
          AUTH_ENDPOINTS.REFRESH,
          { method: 'POST' },
        )
        setAccessToken(response.access_token)
        if (!user.value) await fetchUser()
        return true
      }
      catch {
        clearSession()
        return false
      }
    })()
    try {
      return await refreshInFlight
    }
    finally {
      refreshInFlight = null
    }
  }

  /**
   * Called by the auth plugin on app boot. Tries to recover the session via
   * the refresh cookie. Quietly fails if there isn't one — that's just the
   * "not logged in" state.
   *
   * Runs on both server and client so middleware can decide before SSR
   * paints the wrong surface. After the first attempt completes (success
   * or fail) sets `sessionRestoreAttempted` so route middleware can
   * short-circuit on subsequent calls. Concurrent callers (plugin +
   * middleware on hard reload) share the in-flight promise via
   * `refreshAccessToken`.
   */
  const tryRestoreSession = async (): Promise<boolean> => {
    if (sessionRestoreAttempted.value) return isAuthenticated.value
    try {
      return await refreshAccessToken()
    }
    finally {
      sessionRestoreAttempted.value = true
    }
  }

  /**
   * Re-arm the proactive-refresh timer on client mount after SSR hydration.
   * The server-side restore populates `accessExpiresAt` but never schedules
   * setTimeout (client-only); this is the hook the auth plugin calls once
   * to bridge that gap.
   */
  const armClientTimer = () => {
    if (!import.meta.client) return
    if (accessExpiresAt.value !== null) scheduleProactiveRefresh()
  }

  const updateUser = (userData: Partial<UserResponse>) => {
    if (user.value) {
      user.value = { ...user.value, ...userData }
    }
  }

  const verifyEmail = async (token: string) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<{ message: string }>(`${AUTH_ENDPOINTS.BASE}/verify-email`, {
        method: 'POST',
        body: { token },
      })
      return { success: true, message: response.message }
    }
    catch (error) {
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail || 'Email verification failed.',
      }
    }
  }

  const resendVerification = async (email: string) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<{ message: string }>(`${AUTH_ENDPOINTS.BASE}/resend-verification`, {
        method: 'POST',
        body: { email },
      })
      return { success: true, message: response.message }
    }
    catch (error) {
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail || 'Failed to resend verification email.',
      }
    }
  }

  const requestPasswordReset = async (email: string) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<MessageResponse>(
        AUTH_ENDPOINTS.PASSWORD_RESET_REQUEST,
        { method: 'POST', body: { email } },
      )
      return { success: true, message: response.message } as { success: true, message: string }
    }
    catch (error) {
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail || 'Failed to send password reset email.',
      }
    }
  }

  const confirmPasswordReset = async (token: string, newPassword: string) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<MessageResponse>(
        AUTH_ENDPOINTS.PASSWORD_RESET_CONFIRM,
        { method: 'POST', body: { token, new_password: newPassword } },
      )
      return { success: true, message: response.message } as { success: true, message: string }
    }
    catch (error) {
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail || 'Failed to reset password.',
      }
    }
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<MessageResponse>(
        AUTH_ENDPOINTS.CHANGE_PASSWORD,
        {
          method: 'POST',
          body: { current_password: currentPassword, new_password: newPassword },
        },
      )
      return { success: true, message: response.message } as { success: true, message: string }
    }
    catch (error) {
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail || 'Failed to update password.',
      }
    }
  }

  /**
   * Update the current user's profile via PUT /auth/me and refresh the local
   * `user` ref from the response. Used by the account page's email-language
   * preference; the payload is any subset of the writable profile fields.
   */
  const updateProfile = async (
    payload: Partial<
      Omit<UserResponse, 'email' | 'is_active' | 'is_verified' | 'role' | 'created_at' | 'updated_at'>
    >,
  ) => {
    try {
      const { apiFetch } = useApi()
      const updated = await apiFetch<UserResponse>(AUTH_ENDPOINTS.UPDATE_ME, {
        method: 'PUT',
        body: payload,
      })
      user.value = updated
      return { success: true, data: updated } as ApiResponse<UserResponse>
    }
    catch (error) {
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail ?? 'Failed to update profile.',
        raw: error,
      } as ApiResponse<UserResponse>
    }
  }

  /**
   * Start a view-only impersonation session for a customer. Calls the
   * admin-gated impersonate endpoint with the current admin token, swaps the
   * in-memory access token to the returned short-lived impersonation token, and
   * loads the customer as `user` (GET /auth/me now resolves AS the customer).
   * Setting `impersonating` first suppresses the proactive-refresh timer. On
   * any failure the session is torn down. Returns the impersonated customer.
   */
  const startImpersonation = async (customerId: number) => {
    const { apiFetch } = useApi()
    try {
      const resp = await apiFetch<ImpersonationResponse>(
        `/api/v1/admin/customers/${customerId}/impersonate`,
        { method: 'POST' },
      )
      impersonating.value = resp.customer
      setAccessToken(resp.access_token)
      await fetchUser()
      if (!user.value) throw new Error('Failed to load impersonated customer')
      return { success: true, data: resp.customer } as ApiResponse<ImpersonatedCustomer>
    }
    catch (error) {
      // Don't tear down the admin session on a failed start — just exit
      // impersonation cleanly back to the admin.
      if (impersonating.value) await stopImpersonation()
      const { data } = narrowFetchError(error)
      const detail = typeof data?.detail === 'string' ? data.detail : null
      return {
        success: false,
        error: detail ?? 'Failed to start impersonation.',
        raw: error,
      } as ApiResponse<ImpersonatedCustomer>
    }
  }

  /**
   * Exit impersonation and restore the admin. Clearing `impersonating` + `user`
   * makes `refreshAccessToken` mint a fresh admin access token from the admin's
   * still-valid refresh cookie and re-fetch the admin user (it only fetches when
   * `user` is null). If the admin session has since expired, this lands on the
   * logged-out state.
   */
  const stopImpersonation = async (): Promise<boolean> => {
    if (!impersonating.value) return isAuthenticated.value
    impersonating.value = null
    user.value = null
    return refreshAccessToken()
  }

  return {
    // State — exposed as raw refs (not `readonly()`, not `computed()`) so Pinia
    // serializes the SSR-populated values into the hydration payload. The two
    // previously-tried wrappers both silently broke hard-reload session restore:
    //   - `readonly(ref)` → Pinia tracks as state, hydration writes are rejected
    //     by the readonly proxy and state never lands on the client.
    //   - `computed(() => ref.value)` → Pinia treats as a getter, not state, so
    //     no hydration writes happen at all and state never lands on the client.
    // The Vue warning that the earlier `readonly` → `computed` change silenced
    // was the smoking gun for the first failure mode, not noise. Read-only
    // intent is preserved by convention: consumers mutate auth state through
    // actions (register/login/logout/etc.) only — never by direct assignment.
    // `accessExpiresAt` is included here too so the proactive-refresh timer
    // can re-arm with the correct expiry after a hard reload (its value also
    // has to cross the SSR → client hydration boundary).
    user,
    accessToken,
    accessExpiresAt,
    sessionRestoreAttempted,
    impersonating,

    // Getters
    isAuthenticated,
    fullName,
    isAdmin,
    isImpersonating,

    // Actions
    register,
    registerBusiness,
    login,
    logout,
    startImpersonation,
    stopImpersonation,
    fetchUser,
    refreshAccessToken,
    tryRestoreSession,
    armClientTimer,
    clearSession,
    updateUser,
    updateProfile,
    verifyEmail,
    resendVerification,
    requestPasswordReset,
    confirmPasswordReset,
    changePassword,
  }
})
