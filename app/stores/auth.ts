import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import { AUTH_ENDPOINTS } from '#shared/constants/api'
import type { PersonalSignUpFormData, BusinessSignUpFormData } from '#shared/validators/auth'
import type { UserResponse, TokenResponse, MessageResponse, ApiError, ApiResponse } from '#shared/types/api'

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

  // ---- internal helpers ----

  function decodeJwtExpMs(token: string): number | null {
    try {
      const parts = token.split('.')
      if (parts.length < 2 || !parts[1]) return null
      // base64url → base64
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const json = JSON.parse(atob(b64))
      return typeof json.exp === 'number' ? json.exp * 1000 : null
    } catch {
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
    const delay = accessExpiresAt.value - Date.now() - PROACTIVE_REFRESH_MS
    if (delay <= 0) {
      // Already past the proactive window; refresh on next tick.
      refreshTimer = setTimeout(() => { void refreshAccessToken() }, 0)
      return
    }
    refreshTimer = setTimeout(() => { void refreshAccessToken() }, delay)
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
  }

  // Direct $fetch (NOT useApi) for /auth/refresh and /auth/logout — those
  // endpoints rely on the HttpOnly cookie, not the bearer token, and routing
  // them through useApi would re-enter the 401-retry loop.
  function authBaseFetch() {
    const config = useRuntimeConfig()
    return $fetch.create({
      baseURL: config.public.apiBase as string,
      credentials: 'include',
    })
  }

  // ---- actions ----

  const register = async (data: PersonalSignUpFormData | BusinessSignUpFormData) => {
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
          ...('shippingStreet' in data && data.shippingStreet ? {
            shipping_street: data.shippingStreet,
            shipping_city: data.shippingCity,
            shipping_postal_code: data.shippingPostalCode,
            shipping_country: data.shippingCountry,
            shipping_state: data.shippingState || null
          } : {}),
          ...('companyName' in data && data.companyName ? {
            company_name: data.companyName,
            company_tax_id: data.companyTaxId,
            company_address_street: data.companyAddressStreet,
            company_address_city: data.companyAddressCity,
            company_address_postal_code: data.companyAddressPostalCode,
            company_address_country: data.companyAddressCountry,
            company_address_state: data.companyAddressState || null
          } : {})
        }
      })

      return { success: true, data: response } as ApiResponse<MessageResponse>
    } catch (error: any) {
      const apiError = error?.data as ApiError
      const detail = apiError?.detail
      return {
        success: false,
        error: typeof detail === 'string' ? detail : 'Registration failed. Please try again.',
        raw: error
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

      return { success: true, data: response } as ApiResponse<TokenResponse>
    } catch (error: any) {
      const apiError = error?.data as ApiError
      const detail = apiError?.detail
      return {
        success: false,
        error: typeof detail === 'string' ? detail : 'Login failed. Please check your credentials.',
        raw: error
      } as ApiResponse<TokenResponse>
    }
  }

  const logout = async () => {
    // Best-effort: revoke the refresh row server-side. We don't await any
    // failure — local state is cleared regardless so the UI can move on.
    try {
      await authBaseFetch()(AUTH_ENDPOINTS.LOGOUT, { method: 'POST' })
    } catch {
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
    } catch {
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
   * Returns true on success (access token + user are populated), false on
   * failure (session cleared).
   */
  const refreshAccessToken = async (): Promise<boolean> => {
    if (refreshInFlight) return refreshInFlight
    refreshInFlight = (async () => {
      try {
        const response = await authBaseFetch()<TokenResponse>(
          AUTH_ENDPOINTS.REFRESH,
          { method: 'POST' },
        )
        setAccessToken(response.access_token)
        if (!user.value) await fetchUser()
        return true
      } catch {
        clearSession()
        return false
      }
    })()
    try {
      return await refreshInFlight
    } finally {
      refreshInFlight = null
    }
  }

  /**
   * Called by the auth plugin on app boot. Tries to recover the session via
   * the refresh cookie. Quietly fails if there isn't one — that's just the
   * "not logged in" state.
   */
  const tryRestoreSession = async (): Promise<boolean> => {
    if (!import.meta.client) return false
    return refreshAccessToken()
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
        body: { token }
      })
      return { success: true, message: response.message }
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return {
        success: false,
        error: apiError?.detail || 'Email verification failed.'
      }
    }
  }

  const resendVerification = async (email: string) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<{ message: string }>(`${AUTH_ENDPOINTS.BASE}/resend-verification`, {
        method: 'POST',
        body: { email }
      })
      return { success: true, message: response.message }
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return {
        success: false,
        error: apiError?.detail || 'Failed to resend verification email.'
      }
    }
  }

  const requestPasswordReset = async (email: string) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<MessageResponse>(
        AUTH_ENDPOINTS.PASSWORD_RESET_REQUEST,
        { method: 'POST', body: { email } }
      )
      return { success: true, message: response.message } as { success: true; message: string }
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return {
        success: false,
        error: apiError?.detail || 'Failed to send password reset email.'
      }
    }
  }

  const confirmPasswordReset = async (token: string, newPassword: string) => {
    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<MessageResponse>(
        AUTH_ENDPOINTS.PASSWORD_RESET_CONFIRM,
        { method: 'POST', body: { token, new_password: newPassword } }
      )
      return { success: true, message: response.message } as { success: true; message: string }
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return {
        success: false,
        error: apiError?.detail || 'Failed to reset password.'
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
          body: { current_password: currentPassword, new_password: newPassword }
        }
      )
      return { success: true, message: response.message } as { success: true; message: string }
    } catch (error: any) {
      const apiError = error?.data as ApiError
      return {
        success: false,
        error: apiError?.detail || 'Failed to update password.'
      }
    }
  }

  return {
    // State
    user: readonly(user),
    accessToken: readonly(accessToken),

    // Getters
    isAuthenticated,
    fullName,
    isAdmin,

    // Actions
    register,
    login,
    logout,
    fetchUser,
    refreshAccessToken,
    tryRestoreSession,
    clearSession,
    updateUser,
    verifyEmail,
    resendVerification,
    requestPasswordReset,
    confirmPasswordReset,
    changePassword
  }
})
