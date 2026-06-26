import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

/**
 * `user` middleware — UX-only redirects. Real authorization is enforced
 * server-side; this middleware just hides /account from anonymous visitors
 * and from staff (admins land on /admin instead).
 *
 * Mirrors the structure of `admin.spec.ts`.
 */

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
mockNuxtImport('navigateTo', () => mockNavigate)
// Identity path resolver — no /pl/ prefix in tests (default locale is EN), so
// existing assertions on '/admin' and '/login?redirect=...' hold unchanged.
mockNuxtImport('useLocalePath', () => () => (p: string) => p)
mockNuxtImport(
  'defineNuxtRouteMiddleware',
  () => (fn: any) => fn,
)

type StoreStub = {
  isAuthenticated: boolean
  isAdmin: boolean
  sessionRestoreAttempted: boolean
  tryRestoreSession: ReturnType<typeof vi.fn>
}

const stubStore = (state: Partial<StoreStub>) => {
  const merged: StoreStub = {
    isAuthenticated: false,
    isAdmin: false,
    sessionRestoreAttempted: true,
    tryRestoreSession: vi.fn(),
    ...state,
  }
  vi.doMock('../stores/auth', () => ({
    useAuthStore: () => merged,
  }))
  return merged
}

async function loadMiddleware() {
  const mod = await import('./user')
  return mod.default
}

const ROUTE = { fullPath: '/account' } as any

describe('user middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('../stores/auth')
  })

  it('lets through an authenticated non-admin user', async () => {
    stubStore({ isAuthenticated: true, isAdmin: false })
    const middleware = await loadMiddleware()
    const result = await middleware(ROUTE, ROUTE)

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('redirects an authenticated admin to /admin', async () => {
    stubStore({ isAuthenticated: true, isAdmin: true })
    const middleware = await loadMiddleware()
    await middleware(ROUTE, ROUTE)

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/admin')
  })

  it('redirects an unauthenticated visitor to /login, preserving the original path in ?redirect', async () => {
    stubStore({ isAuthenticated: false, isAdmin: false })
    const middleware = await loadMiddleware()
    await middleware({ fullPath: '/account/orders' } as any, ROUTE)

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/account/orders')}`,
    )
  })

  it('awaits tryRestoreSession when the boot restore has not yet resolved', async () => {
    const store = stubStore({ sessionRestoreAttempted: false })
    store.tryRestoreSession = vi.fn(async () => {
      store.isAuthenticated = true
      store.isAdmin = false
      return true
    })

    const middleware = await loadMiddleware()
    const result = await middleware(ROUTE, ROUTE)

    expect(store.tryRestoreSession).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('redirects to /login after restore when the cookie was missing or invalid', async () => {
    const store = stubStore({ sessionRestoreAttempted: false })
    store.tryRestoreSession = vi.fn(async () => false)

    const middleware = await loadMiddleware()
    await middleware(ROUTE, ROUTE)

    expect(store.tryRestoreSession).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/account')}`,
    )
  })

  it('redirects admin to /admin after restore reveals admin role', async () => {
    const store = stubStore({ sessionRestoreAttempted: false })
    store.tryRestoreSession = vi.fn(async () => {
      store.isAuthenticated = true
      store.isAdmin = true
      return true
    })

    const middleware = await loadMiddleware()
    await middleware(ROUTE, ROUTE)

    expect(store.tryRestoreSession).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/admin')
  })
})
