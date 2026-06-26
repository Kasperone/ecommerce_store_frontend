import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { setupTestPinia } from '../../test/helpers/createTestPinia'

/**
 * Auth store tests — pure unit tests against a stubbed network.
 *
 * Strategy: let `useApi` run for real (it's just `$fetch` + bearer + 401-retry)
 * and mock the `$fetch` global at the network boundary. That keeps the bearer
 * + retry logic exercised in store flows that go through it.
 *
 * `useApi` calls `$fetch.create(...)` is NOT used — that path is only inside
 * `authBaseFetch()` (login/refresh/logout, which sidestep the 401 retry).
 *
 *   - $fetch(url, opts)        → store actions that go via useApi (e.g. /me, /register, …)
 *   - $fetch.create()(url, opts) → /login, /refresh, /logout
 *
 * `useRuntimeConfig` and `navigateTo` are auto-imports that aren't available in
 * a plain Vitest env; we shim them via `mockNuxtImport`.
 */

const { mockAuthFetcher, mockFetch, mockNavigate } = vi.hoisted(() => {
  const mockAuthFetcher = vi.fn()
  const mockFetch: any = vi.fn()
  mockFetch.create = vi.fn(() => mockAuthFetcher)
  const mockNavigate = vi.fn()
  return { mockAuthFetcher, mockFetch, mockNavigate }
})

mockNuxtImport(
  'useRuntimeConfig',
  () => () => ({ public: { apiBase: 'http://test' } }),
)
mockNuxtImport('navigateTo', () => mockNavigate)
// The store calls useApi() for real, which now resolves useLocalePath() at
// setup — shim it as an identity path resolver (default locale EN, no prefix).
mockNuxtImport('useLocalePath', () => () => (p: string) => p)

;(globalThis as any).$fetch = mockFetch

const ME_USER = {
  email: 'ada@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  is_active: true,
  is_verified: true,
  role: 'CUSTOMER' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const ADMIN_USER = { ...ME_USER, role: 'ADMIN' as const }

function buildJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ exp, sub: 1 }))
  return `${header}.${payload}.signature`
}

const FUTURE_EXP = () => Math.floor(Date.now() / 1000) + 3600

async function loadStore() {
  const mod = await import('./auth')
  return mod.useAuthStore()
}

/**
 * Helper: dispatch URL-routed responses through `$fetch`.
 *
 * `useApi.apiFetch` calls `$fetch(url, opts)`. We let tests pre-register a map
 * of "URL substring → handler" so each test reads naturally instead of
 * counting mockResolvedValueOnce slots.
 */
function routeFetch(routes: Record<string, (opts: any) => any>) {
  mockFetch.mockImplementation(async (url: string, opts: any) => {
    for (const key of Object.keys(routes)) {
      if (String(url).includes(key)) return routes[key]!(opts)
    }
    throw new Error(`Unrouted $fetch URL in test: ${url}`)
  })
}

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // `clearAllMocks` wipes `.create` (it's a vi.fn), so reattach it.
    mockFetch.create = vi.fn(() => mockAuthFetcher)
    // Default: every request the test doesn't route is an explicit failure —
    // tests must opt in to a request happening.
    mockFetch.mockImplementation((url: string) => {
      throw new Error(`Unrouted $fetch URL in test: ${url}`)
    })
    mockAuthFetcher.mockImplementation((url: string) => {
      throw new Error(`Unrouted authFetcher URL in test: ${url}`)
    })

    // Use fake timers so the proactive-refresh setTimeout doesn't leak between
    // tests. We never advance — the timer is captured but not fired unless a
    // test opts in.
    vi.useFakeTimers()
    setupTestPinia()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts logged-out with empty getters', async () => {
      const store = await loadStore()
      expect(store.user).toBeNull()
      expect(store.accessToken).toBeNull()
      expect(store.isAuthenticated).toBe(false)
      expect(store.fullName).toBeNull()
      expect(store.isAdmin).toBe(false)
    })
  })

  describe('login', () => {
    it('posts FormData credentials, stores the access token, and fetches /me', async () => {
      const accessToken = buildJwt(FUTURE_EXP())
      mockAuthFetcher.mockResolvedValueOnce({
        access_token: accessToken,
        token_type: 'bearer',
      })
      routeFetch({
        '/auth/me': () => ME_USER,
      })

      const store = await loadStore()
      const result = await store.login('ada@example.com', 'password')

      expect(result.success).toBe(true)
      expect(store.accessToken).toBe(accessToken)
      expect(store.user).toEqual(ME_USER)
      expect(store.isAuthenticated).toBe(true)
      expect(store.fullName).toBe('Ada Lovelace')

      // OAuth2 password-grant FormData payload
      const [, opts] = mockAuthFetcher.mock.calls[0]
      expect(opts.method).toBe('POST')
      expect(opts.body).toBeInstanceOf(FormData)
      expect((opts.body as FormData).get('username')).toBe('ada@example.com')
      expect((opts.body as FormData).get('password')).toBe('password')

      // /me should be called with the bearer header from the freshly stored token.
      const meCall = mockFetch.mock.calls.find(([url]: any[]) =>
        String(url).includes('/auth/me'),
      )
      expect(meCall).toBeDefined()
      const meHeaders = meCall![1].headers as Headers
      expect(meHeaders.get('Authorization')).toBe(`Bearer ${accessToken}`)
    })

    it('returns the backend detail on auth failure', async () => {
      mockAuthFetcher.mockRejectedValueOnce({
        data: { detail: 'Invalid credentials' },
      })
      const store = await loadStore()

      const result = await store.login('ada@example.com', 'wrong')

      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Invalid credentials')
      expect(store.accessToken).toBeNull()
      expect(store.user).toBeNull()
    })

    it('falls back to a generic message when the response shape is unexpected', async () => {
      mockAuthFetcher.mockRejectedValueOnce(new Error('network down'))
      const store = await loadStore()

      const result = await store.login('a@b.com', 'pw')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Login failed. Please check your credentials.')
      }
    })
  })

  describe('isAdmin getter', () => {
    it('is true when the user role is ADMIN', async () => {
      mockAuthFetcher.mockResolvedValueOnce({
        access_token: buildJwt(FUTURE_EXP()),
        token_type: 'bearer',
      })
      routeFetch({ '/auth/me': () => ADMIN_USER })

      const store = await loadStore()
      await store.login('admin@example.com', 'pw')
      expect(store.isAdmin).toBe(true)
    })

    it('is false for a non-admin user', async () => {
      mockAuthFetcher.mockResolvedValueOnce({
        access_token: buildJwt(FUTURE_EXP()),
        token_type: 'bearer',
      })
      routeFetch({ '/auth/me': () => ME_USER })

      const store = await loadStore()
      await store.login('ada@example.com', 'pw')
      expect(store.isAdmin).toBe(false)
    })
  })

  describe('logout', () => {
    it('hits /auth/logout, clears local state, and swallows network errors', async () => {
      mockAuthFetcher.mockResolvedValueOnce({
        access_token: buildJwt(FUTURE_EXP()),
        token_type: 'bearer',
      })
      routeFetch({ '/auth/me': () => ME_USER })

      const store = await loadStore()
      await store.login('ada@example.com', 'pw')
      expect(store.isAuthenticated).toBe(true)

      // Logout — server unreachable, but local state should still clear.
      mockAuthFetcher.mockRejectedValueOnce(new Error('boom'))
      await store.logout()

      expect(store.accessToken).toBeNull()
      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)

      const logoutCall = mockAuthFetcher.mock.calls.find(([url]) =>
        String(url).endsWith('/logout'),
      )
      expect(logoutCall).toBeDefined()
    })
  })

  describe('refreshAccessToken', () => {
    it('rotates the access token and fetches /me when user is missing', async () => {
      const accessToken = buildJwt(FUTURE_EXP())
      mockAuthFetcher.mockResolvedValueOnce({
        access_token: accessToken,
        token_type: 'bearer',
      })
      routeFetch({ '/auth/me': () => ME_USER })

      const store = await loadStore()
      const ok = await store.refreshAccessToken()

      expect(ok).toBe(true)
      expect(store.accessToken).toBe(accessToken)
      expect(store.user).toEqual(ME_USER)
    })

    it('returns false and clears the session when /refresh fails', async () => {
      mockAuthFetcher.mockRejectedValueOnce(new Error('401'))
      const store = await loadStore()

      const ok = await store.refreshAccessToken()

      expect(ok).toBe(false)
      expect(store.accessToken).toBeNull()
      expect(store.user).toBeNull()
    })

    it('shares a single in-flight promise for parallel callers', async () => {
      const accessToken = buildJwt(FUTURE_EXP())

      let resolveRefresh!: (val: any) => void
      mockAuthFetcher.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve
          }),
      )
      // /me will be hit after the refresh resolves.
      routeFetch({ '/auth/me': () => ME_USER })

      const store = await loadStore()
      const a = store.refreshAccessToken()
      const b = store.refreshAccessToken()
      const c = store.refreshAccessToken()

      // Only one refresh hit despite three concurrent callers.
      expect(mockAuthFetcher).toHaveBeenCalledTimes(1)

      resolveRefresh({ access_token: accessToken, token_type: 'bearer' })
      const results = await Promise.all([a, b, c])
      expect(results).toEqual([true, true, true])
    })
  })

  describe('clearSession', () => {
    it('wipes user + token regardless of refresh-cookie state', async () => {
      mockAuthFetcher.mockResolvedValueOnce({
        access_token: buildJwt(FUTURE_EXP()),
        token_type: 'bearer',
      })
      routeFetch({ '/auth/me': () => ME_USER })

      const store = await loadStore()
      await store.login('ada@example.com', 'pw')
      expect(store.isAuthenticated).toBe(true)

      store.clearSession()

      expect(store.accessToken).toBeNull()
      expect(store.user).toBeNull()
      expect(store.isAuthenticated).toBe(false)
    })
  })

  describe('register', () => {
    it('flattens the personal sign-up payload to snake_case for the API', async () => {
      routeFetch({
        '/auth/register': () => ({ message: 'check your email' }),
      })

      const store = await loadStore()
      const result = await store.register({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+1234',
        password: 'Sup3rSecret!',
        confirmPassword: 'Sup3rSecret!',
      } as any)

      expect(result.success).toBe(true)
      const registerCall = mockFetch.mock.calls.find(([url]: any[]) =>
        String(url).includes('/auth/register'),
      )
      expect(registerCall).toBeDefined()
      const opts = registerCall![1]
      expect(opts.body).toMatchObject({
        email: 'ada@example.com',
        first_name: 'Ada',
        last_name: 'Lovelace',
        password: 'Sup3rSecret!',
      })
      expect(opts.body).not.toHaveProperty('company_name')
    })

    it('returns the backend error detail on failure', async () => {
      mockFetch.mockImplementationOnce(() => {
        return Promise.reject({ data: { detail: 'Email already registered' } })
      })

      const store = await loadStore()
      const result = await store.register({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'Sup3rSecret!',
        confirmPassword: 'Sup3rSecret!',
      } as any)

      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Email already registered')
    })

    it('sends the locale in the register body (default en, override pl)', async () => {
      routeFetch({ '/auth/register': () => ({ message: 'ok' }) })
      const store = await loadStore()
      const data = {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'Sup3rSecret!',
        confirmPassword: 'Sup3rSecret!',
      } as any
      await store.register(data) // default
      await store.register(data, 'pl') // override
      const calls = mockFetch.mock.calls.filter(([url]: any[]) =>
        String(url).includes('/auth/register'),
      )
      expect(calls[0]![1].body).toMatchObject({ locale: 'en' })
      expect(calls[1]![1].body).toMatchObject({ locale: 'pl' })
    })
  })

  describe('registerBusiness', () => {
    it('posts the business payload (incl. company address) to /auth/register-business', async () => {
      routeFetch({
        '/auth/register-business': () => ({ message: 'check your email' }),
      })

      const store = await loadStore()
      const result = await store.registerBusiness({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@acme.test',
        phone: '+48 22 123 45 67',
        password: 'Sup3rSecret!',
        confirmPassword: 'Sup3rSecret!',
        companyName: 'Acme Corp',
        companyTaxId: 'PL1234567890',
        companyAddressStreet: '1 Commerce St',
        companyAddressCity: 'Warsaw',
        companyAddressPostalCode: '00-001',
        companyAddressCountry: 'PL',
        companyAddressState: 'Mazowieckie',
      } as any)

      expect(result.success).toBe(true)
      const call = mockFetch.mock.calls.find(([url]: any[]) =>
        String(url).includes('/auth/register-business'),
      )
      expect(call).toBeDefined()
      const opts = call![1]
      expect(opts.method).toBe('POST')
      expect(opts.body).toEqual({
        email: 'ada@acme.test',
        password: 'Sup3rSecret!',
        first_name: 'Ada',
        last_name: 'Lovelace',
        phone: '+48 22 123 45 67',
        company_name: 'Acme Corp',
        company_tax_id: 'PL1234567890',
        company_address_street: '1 Commerce St',
        company_address_city: 'Warsaw',
        company_address_postal_code: '00-001',
        company_address_country: 'PL',
        company_address_state: 'Mazowieckie',
      })
    })

    it('sends null for an omitted optional phone / tax id', async () => {
      routeFetch({ '/auth/register-business': () => ({ message: 'ok' }) })
      const store = await loadStore()
      await store.registerBusiness({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@acme.test',
        password: 'Sup3rSecret!',
        confirmPassword: 'Sup3rSecret!',
        companyName: 'Acme Corp',
      } as any)
      const call = mockFetch.mock.calls.find(([url]: any[]) =>
        String(url).includes('/auth/register-business'),
      )
      expect(call![1].body).toMatchObject({
        phone: null,
        company_tax_id: null,
        company_address_street: null,
      })
    })

    it('returns the backend error detail on failure', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.reject({ data: { detail: 'Password is too weak' } }),
      )
      const store = await loadStore()
      const result = await store.registerBusiness({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@acme.test',
        password: 'weak',
        confirmPassword: 'weak',
        companyName: 'Acme Corp',
      } as any)

      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Password is too weak')
    })
  })

  describe('updateProfile', () => {
    it('PUTs /auth/me and refreshes the local user from the response', async () => {
      routeFetch({
        '/auth/me': () => ({
          email: 'ada@example.com',
          first_name: 'Ada',
          last_name: 'Lovelace',
          locale: 'pl',
          is_active: true,
          is_verified: true,
          role: 'CUSTOMER',
          created_at: '',
          updated_at: '',
        }),
      })
      const store = await loadStore()
      const result = await store.updateProfile({ locale: 'pl' })

      expect(result.success).toBe(true)
      expect(store.user?.locale).toBe('pl')
      const call = mockFetch.mock.calls.find(([url]: any[]) => String(url).includes('/auth/me'))
      expect(call![1].method).toBe('PUT')
      expect(call![1].body).toEqual({ locale: 'pl' })
    })

    it('returns the backend error detail on failure', async () => {
      mockFetch.mockImplementationOnce(() => Promise.reject({ data: { detail: 'nope' } }))
      const store = await loadStore()
      const result = await store.updateProfile({ locale: 'pl' })

      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('nope')
    })
  })

  describe('verifyEmail / resendVerification', () => {
    it('verifyEmail returns the success message from the API', async () => {
      routeFetch({
        '/verify-email': () => ({ message: 'Email verified' }),
      })

      const store = await loadStore()
      const result = await store.verifyEmail('token-123')

      expect(result.success).toBe(true)
      if (result.success) expect(result.message).toBe('Email verified')
      const call = mockFetch.mock.calls.find(([url]: any[]) =>
        String(url).includes('/verify-email'),
      )
      expect(call![1].body).toEqual({ token: 'token-123' })
    })

    it('resendVerification surfaces the backend detail on failure', async () => {
      mockFetch.mockImplementationOnce(() => {
        return Promise.reject({ data: { detail: 'Rate limited' } })
      })

      const store = await loadStore()
      const result = await store.resendVerification('ada@example.com')

      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBe('Rate limited')
    })
  })

  describe('password reset / change', () => {
    it('requestPasswordReset posts the email', async () => {
      routeFetch({
        '/password-reset/request': () => ({ message: 'sent' }),
      })

      const store = await loadStore()
      const result = await store.requestPasswordReset('ada@example.com')

      expect(result.success).toBe(true)
      const call = mockFetch.mock.calls.find(([url]: any[]) =>
        String(url).includes('/password-reset/request'),
      )
      expect(call![1].body).toEqual({ email: 'ada@example.com' })
    })

    it('confirmPasswordReset posts token + new_password', async () => {
      routeFetch({
        '/password-reset/confirm': () => ({ message: 'ok' }),
      })

      const store = await loadStore()
      const result = await store.confirmPasswordReset('tok', 'NewPass1!')

      expect(result.success).toBe(true)
      const call = mockFetch.mock.calls.find(([url]: any[]) =>
        String(url).includes('/password-reset/confirm'),
      )
      expect(call![1].body).toEqual({
        token: 'tok',
        new_password: 'NewPass1!',
      })
    })

    it('changePassword posts current_password + new_password', async () => {
      routeFetch({
        '/change-password': () => ({ message: 'rotated' }),
      })

      const store = await loadStore()
      const result = await store.changePassword('OldPass1!', 'NewPass1!')

      expect(result.success).toBe(true)
      const call = mockFetch.mock.calls.find(([url]: any[]) =>
        String(url).includes('/change-password'),
      )
      expect(call![1].body).toEqual({
        current_password: 'OldPass1!',
        new_password: 'NewPass1!',
      })
    })
  })

  describe('updateUser', () => {
    it('merges into existing user, no-op when logged out', async () => {
      mockAuthFetcher.mockResolvedValueOnce({
        access_token: buildJwt(FUTURE_EXP()),
        token_type: 'bearer',
      })
      routeFetch({ '/auth/me': () => ME_USER })

      const store = await loadStore()

      // No-op while logged out — must not throw.
      store.updateUser({ first_name: 'Grace' })
      expect(store.user).toBeNull()

      await store.login('ada@example.com', 'pw')
      store.updateUser({ first_name: 'Grace' })
      expect(store.user?.first_name).toBe('Grace')
      expect(store.user?.last_name).toBe('Lovelace') // untouched
    })
  })

  /**
   * Regression guard for the bug fixed in `fix/auth-store-pinia-hydration`:
   * Pinia setup-stores only serialize properties that are exposed as refs
   * (state). When the return wraps state in `readonly(...)` (writes rejected)
   * or `computed(...)` (treated as a getter, not state), the SSR-populated
   * values never reach the client store after hydration. The visible symptom
   * was `e2e/auth/refresh.spec.ts` failing — the post-130s hard reload
   * rendered Login/Sign-up instead of the Account button because none of the
   * SSR-refreshed auth state crossed the hydration boundary.
   */
  describe('Pinia SSR hydration', () => {
    it('round-trip preserves user, accessToken, accessExpiresAt, sessionRestoreAttempted', async () => {
      // --- SSR side: populate the server store and capture serialized state. ---
      const ssrPinia = createPinia()
      setActivePinia(ssrPinia)
      const ssrStore = await loadStore()

      const futureExpiry = Date.now() + 120_000
      ssrStore.$patch({
        user: ME_USER,
        accessToken: 'ssr-access-token',
        accessExpiresAt: futureExpiry,
        sessionRestoreAttempted: true,
      })

      // This is what Nuxt serializes into __NUXT_DATA__ on the SSR pass.
      const payload = JSON.parse(JSON.stringify(ssrPinia.state.value))

      // --- Client side: brand-new Pinia, hydrate from payload, read store. ---
      const clientPinia = createPinia()
      clientPinia.state.value = payload
      setActivePinia(clientPinia)

      const clientStore = await loadStore()

      expect(clientStore.user).toEqual(ME_USER)
      expect(clientStore.accessToken).toBe('ssr-access-token')
      expect(clientStore.accessExpiresAt).toBe(futureExpiry)
      expect(clientStore.sessionRestoreAttempted).toBe(true)
      expect(clientStore.isAuthenticated).toBe(true)
    })
  })

  describe('impersonation', () => {
    const CUSTOMER = { id: 7, email: 'shopper@example.com', first_name: 'Sam', last_name: 'Shopper' }

    it('startImpersonation swaps to the impersonation token and loads the customer', async () => {
      const store = await loadStore()
      const impToken = buildJwt(FUTURE_EXP())
      routeFetch({
        '/impersonate': () => ({
          access_token: impToken,
          token_type: 'bearer',
          expires_at: '2026-01-01T00:30:00Z',
          customer: CUSTOMER,
        }),
        '/me': () => ({ ...ME_USER, email: CUSTOMER.email, first_name: 'Sam', last_name: 'Shopper' }),
      })

      const res = await store.startImpersonation(7)

      expect(res.success).toBe(true)
      expect(store.isImpersonating).toBe(true)
      expect(store.impersonating?.email).toBe(CUSTOMER.email)
      expect(store.accessToken).toBe(impToken)
      expect(store.user?.email).toBe(CUSTOMER.email)
    })

    it('stopImpersonation restores the admin via the refresh cookie', async () => {
      const store = await loadStore()
      const impToken = buildJwt(FUTURE_EXP())
      routeFetch({
        '/impersonate': () => ({ access_token: impToken, token_type: 'bearer', expires_at: 'x', customer: CUSTOMER }),
        '/me': () => ({ ...ME_USER, email: CUSTOMER.email }),
      })
      await store.startImpersonation(7)
      expect(store.isImpersonating).toBe(true)

      // Exit: /auth/refresh (authFetcher, admin cookie) → admin token, then /me → admin user.
      const adminToken = buildJwt(FUTURE_EXP())
      mockAuthFetcher.mockResolvedValueOnce({ access_token: adminToken })
      routeFetch({ '/me': () => ADMIN_USER })

      const ok = await store.stopImpersonation()

      expect(ok).toBe(true)
      expect(store.isImpersonating).toBe(false)
      expect(store.accessToken).toBe(adminToken)
      expect(store.user?.role).toBe('ADMIN')
    })
  })
})
