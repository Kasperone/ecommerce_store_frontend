import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { setupTestPinia } from '../../test/helpers/createTestPinia'

/**
 * `useApi` tests cover the wrapper invariants the rest of the app depends on:
 *   - Bearer header injected from the auth store when present
 *   - 401 → silent refresh → retry once with the new token
 *   - Concurrent 401s share a single refresh promise (no thundering herd)
 *   - /auth/refresh and /auth/logout sidestep the 401-retry loop
 *   - Refresh failure clears the session and bounces to /login
 */

const { mockFetch, mockNavigate } = vi.hoisted(() => {
  const mockFetch: any = vi.fn()
  const mockNavigate = vi.fn()
  return { mockFetch, mockNavigate }
})

mockNuxtImport(
  'useRuntimeConfig',
  () => () => ({ public: { apiBase: 'http://test' } }),
)
mockNuxtImport('navigateTo', () => mockNavigate)

;(globalThis as any).$fetch = mockFetch

function fetchError(status: number, data?: unknown) {
  // FetchError shape used by ofetch — `.response.status` is the load-bearing field.
  const err: any = new Error(`HTTP ${status}`)
  err.response = { status, _data: data }
  err.status = status
  err.data = data
  return err
}

async function loadUseApi() {
  const mod = await import('./useApi')
  return mod.useApi
}

async function loadAuthStore() {
  const mod = await import('../stores/auth')
  return mod.useAuthStore()
}

describe('useApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setupTestPinia()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('forwards URL + baseURL + credentials and a Bearer header from the store', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    // Seed the store with an access token via the lower-level setter (refresh
    // works without a real /refresh round-trip — saves two fixtures).
    const store = await loadAuthStore()
    // Use Object.defineProperty? No — the store's accessToken is readonly.
    // Easier: clearSession then fake a successful refresh by calling the action.
    // Simpler still: drive a real login via mocks. But that's a big setup for
    // this one assertion. Instead, write the token via the store's exposed
    // refresh path using `$fetch.create`.
    mockFetch.create = vi.fn(() => async () => ({
      access_token: 'header.eyJleHAiOjk5OTk5OTk5OTl9.sig',
      token_type: 'bearer',
    }))
    // Patch /me too so refresh can populate `user`.
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes('/auth/me')) {
        return {
          email: 'a@b.com',
          first_name: 'A',
          last_name: 'B',
          is_active: true,
          is_verified: true,
          role: 'CUSTOMER',
          created_at: 'x',
          updated_at: 'x',
        }
      }
      return { ok: true }
    })
    await store.refreshAccessToken()

    const useApi = await loadUseApi()
    const { apiFetch } = useApi()
    await apiFetch('/some/url', { method: 'GET' })

    const lastCall = mockFetch.mock.calls.at(-1)!
    const [url, opts] = lastCall
    expect(url).toBe('/some/url')
    expect(opts.baseURL).toBe('http://test')
    expect(opts.credentials).toBe('include')
    expect(opts.method).toBe('GET')
    expect((opts.headers as Headers).get('Authorization')).toMatch(/^Bearer /)
  })

  it('omits the Authorization header when the store has no token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })

    const useApi = await loadUseApi()
    const { apiFetch } = useApi()
    await apiFetch('/public/things')

    const [, opts] = mockFetch.mock.calls.at(-1)!
    expect((opts.headers as Headers).has('Authorization')).toBe(false)
  })

  it('on 401, calls /auth/refresh and retries the original request once', async () => {
    // Seed an old token so the bearer is present on the first attempt.
    const oldToken = 'old.eyJleHAiOjk5OTk5OTk5OTl9.sig'
    const newToken = 'new.eyJleHAiOjk5OTk5OTk5OTl9.sig'
    mockFetch.create = vi.fn(() => async () => ({
      access_token: newToken,
      token_type: 'bearer',
    }))

    let callCount = 0
    mockFetch.mockImplementation(async (url: string, opts: any) => {
      if (String(url).includes('/auth/me')) {
        return {
          email: 'a@b.com',
          first_name: 'A',
          last_name: 'B',
          is_active: true,
          is_verified: true,
          role: 'CUSTOMER',
          created_at: 'x',
          updated_at: 'x',
        }
      }
      if (String(url) === '/protected') {
        callCount++
        // First attempt: 401 with the old bearer. Retry: 200 with the new bearer.
        const auth = (opts.headers as Headers).get('Authorization')
        if (auth?.includes('old.')) throw fetchError(401)
        return { secret: 'data' }
      }
      throw new Error(`unrouted: ${url}`)
    })

    const store = await loadAuthStore()
    // Initial successful refresh seeds the store with `oldToken`.
    mockFetch.create = vi.fn(() => async () => ({
      access_token: oldToken,
      token_type: 'bearer',
    }))
    await store.refreshAccessToken()
    // Subsequent refreshes (triggered by the 401 retry) hand back the new token.
    mockFetch.create = vi.fn(() => async () => ({
      access_token: newToken,
      token_type: 'bearer',
    }))

    const useApi = await loadUseApi()
    const result: any = await useApi().apiFetch('/protected')

    expect(result).toEqual({ secret: 'data' })
    expect(callCount).toBe(2) // one 401, one retry
    expect(store.accessToken).toBe(newToken)
  })

  it('does not enter the 401-retry loop for /auth/refresh or /auth/logout', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url) === '/api/v1/auth/refresh' || String(url) === '/api/v1/auth/logout') {
        throw fetchError(401)
      }
      throw new Error(`unrouted: ${url}`)
    })

    const useApi = await loadUseApi()
    const { apiFetch } = useApi()

    // Both should reject without attempting silent refresh / retry.
    await expect(apiFetch('/api/v1/auth/refresh', { method: 'POST' })).rejects.toBeDefined()
    await expect(apiFetch('/api/v1/auth/logout', { method: 'POST' })).rejects.toBeDefined()

    // Only the original calls — no retry.
    const refreshCalls = mockFetch.mock.calls.filter(([u]: any[]) =>
      String(u).endsWith('/auth/refresh'),
    )
    const logoutCalls = mockFetch.mock.calls.filter(([u]: any[]) =>
      String(u).endsWith('/auth/logout'),
    )
    expect(refreshCalls.length).toBe(1)
    expect(logoutCalls.length).toBe(1)
  })

  it('clears the session and navigates to /login when the silent refresh fails', async () => {
    // First call: 401. /auth/refresh: also fails — session is gone.
    mockFetch.create = vi.fn(() => async () => {
      throw fetchError(401)
    })

    mockFetch.mockImplementation(async (url: string) => {
      if (String(url) === '/protected') throw fetchError(401)
      throw new Error(`unrouted: ${url}`)
    })

    const useApi = await loadUseApi()
    await expect(useApi().apiFetch('/protected')).rejects.toBeDefined()

    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })

  it('shares a single in-flight refresh across concurrent 401s', async () => {
    const newToken = 'new.eyJleHAiOjk5OTk5OTk5OTl9.sig'

    // The refresh promise is slow — we resolve it manually after firing N calls.
    let resolveRefresh!: (val: any) => void
    let refreshHits = 0
    mockFetch.create = vi.fn(() => async () => {
      refreshHits++
      return await new Promise((resolve) => {
        resolveRefresh = resolve
      })
    })

    let protectedHits = 0
    mockFetch.mockImplementation(async (url: string, opts: any) => {
      if (String(url).includes('/auth/me')) {
        return {
          email: 'a@b.com',
          first_name: 'A',
          last_name: 'B',
          is_active: true,
          is_verified: true,
          role: 'CUSTOMER',
          created_at: 'x',
          updated_at: 'x',
        }
      }
      if (String(url) === '/protected') {
        protectedHits++
        const auth = (opts.headers as Headers).get('Authorization')
        if (!auth || auth.includes('old.')) throw fetchError(401)
        return { ok: true }
      }
      throw new Error(`unrouted: ${url}`)
    })

    const useApi = await loadUseApi()
    const a = useApi().apiFetch('/protected')
    const b = useApi().apiFetch('/protected')
    const c = useApi().apiFetch('/protected')

    // Yield so the three apiFetch promises start their initial $fetch and
    // queue up on the shared refresh.
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    await Promise.resolve()

    // Three 401s, but only ONE /auth/refresh hit (shared promise).
    expect(refreshHits).toBe(1)

    resolveRefresh({ access_token: newToken, token_type: 'bearer' })
    const results = await Promise.all([a, b, c])
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(protectedHits).toBe(6) // 3 initial + 3 retries
  })

  it('non-401 errors are rethrown as-is, no refresh attempt', async () => {
    let refreshHits = 0
    mockFetch.create = vi.fn(() => async () => {
      refreshHits++
      return { access_token: 'x', token_type: 'bearer' }
    })

    mockFetch.mockImplementation(async (url: string) => {
      if (String(url) === '/boom') throw fetchError(500, { detail: 'server error' })
      throw new Error(`unrouted: ${url}`)
    })

    const useApi = await loadUseApi()
    await expect(useApi().apiFetch('/boom')).rejects.toMatchObject({
      status: 500,
    })
    expect(refreshHits).toBe(0)
  })
})
