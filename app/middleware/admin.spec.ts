import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

/**
 * `admin` middleware — UX-only redirects. Real authorization is enforced
 * server-side; this middleware just hides admin routes from non-admins and
 * avoids a flash of forbidden content.
 *
 * Strategy: mock the auth store directly with `vi.doMock` so we can drive the
 * three branches (no-auth, auth+non-admin, auth+admin) by toggling the
 * `isAuthenticated` / `isAdmin` getters.
 *
 * `defineNuxtRouteMiddleware` is a Nuxt build-time macro; we substitute a
 * passthrough that returns its handler unchanged.
 */

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
mockNuxtImport('navigateTo', () => mockNavigate)
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
    // Default: assume the boot-time restore has already resolved so existing
    // tests don't have to think about the await-restore branch.
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
  const mod = await import('./admin')
  return mod.default
}

const ROUTE = { fullPath: '/admin/products' } as any

describe('admin middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('../stores/auth')
  })

  it('lets through an authenticated admin user', async () => {
    stubStore({ isAuthenticated: true, isAdmin: true })
    const middleware = await loadMiddleware()
    const result = await middleware(ROUTE, ROUTE)

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('redirects an authenticated non-admin to /', async () => {
    stubStore({ isAuthenticated: true, isAdmin: false })
    const middleware = await loadMiddleware()
    await middleware(ROUTE, ROUTE)

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('redirects an unauthenticated visitor to /login, preserving the original path in ?redirect', async () => {
    stubStore({ isAuthenticated: false, isAdmin: false })
    const middleware = await loadMiddleware()
    await middleware({ fullPath: '/admin/orders' } as any, ROUTE)

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/admin/orders')}`,
    )
  })

  it('URL-encodes the redirect path so query strings round-trip safely', async () => {
    stubStore({ isAuthenticated: false, isAdmin: false })
    const middleware = await loadMiddleware()
    await middleware({ fullPath: '/admin/orders?status=open&q=foo bar' } as any, ROUTE)

    expect(mockNavigate).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/admin/orders?status=open&q=foo bar')}`,
    )
  })

  // Plugin's tryRestoreSession may still be in flight on hard reload. The
  // middleware must wait for the first attempt before deciding to redirect.
  it('awaits tryRestoreSession when the boot restore has not yet resolved', async () => {
    const store = stubStore({ sessionRestoreAttempted: false })
    store.tryRestoreSession = vi.fn(async () => {
      store.isAuthenticated = true
      store.isAdmin = true
      return true
    })

    const middleware = await loadMiddleware()
    const result = await middleware(ROUTE, ROUTE)

    expect(store.tryRestoreSession).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('redirects after restore when the cookie was missing or invalid', async () => {
    const store = stubStore({
      sessionRestoreAttempted: false,
    })
    store.tryRestoreSession = vi.fn(async () => false)

    const middleware = await loadMiddleware()
    await middleware(ROUTE, ROUTE)

    expect(store.tryRestoreSession).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/admin/products')}`,
    )
  })

  it('skips tryRestoreSession when the boot restore has already resolved', async () => {
    const store = stubStore({
      isAuthenticated: true,
      isAdmin: true,
      sessionRestoreAttempted: true,
    })

    const middleware = await loadMiddleware()
    await middleware(ROUTE, ROUTE)

    expect(store.tryRestoreSession).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
