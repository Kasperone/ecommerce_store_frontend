import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

/**
 * `account-settings-redirect` middleware — permanently (301) maps the old
 * flattened-away settings routes to their new `/account/<x>` homes, preserving
 * any i18n locale prefix, query, and hash. Mirrors the structure of
 * `user.spec.ts`.
 */

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))
mockNuxtImport('navigateTo', () => mockNavigate)
mockNuxtImport('defineNuxtRouteMiddleware', () => (fn: any) => fn)

async function loadMiddleware() {
  const mod = await import('./account-settings-redirect')
  return mod.default
}

const route = (path: string, extra: Record<string, any> = {}) =>
  ({ path, query: {}, hash: '', ...extra }) as any

describe('account-settings-redirect middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('redirects a settings sub-page to its flattened path with a 301', async () => {
    const middleware = await loadMiddleware()
    await middleware(route('/account/settings/profile'), route('/'))

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(
      { path: '/account/profile', query: {}, hash: '' },
      { redirectCode: 301 },
    )
  })

  it('redirects the menu-only hub to the account overview', async () => {
    const middleware = await loadMiddleware()
    await middleware(route('/account/settings'), route('/'))

    expect(mockNavigate).toHaveBeenCalledWith(
      { path: '/account', query: {}, hash: '' },
      { redirectCode: 301 },
    )
  })

  it('preserves the i18n locale prefix', async () => {
    const middleware = await loadMiddleware()
    await middleware(route('/pl/account/settings/team'), route('/'))

    expect(mockNavigate).toHaveBeenCalledWith(
      { path: '/pl/account/team', query: {}, hash: '' },
      { redirectCode: 301 },
    )
  })

  it('carries over query and hash', async () => {
    const middleware = await loadMiddleware()
    await middleware(
      route('/account/settings/security', { query: { tab: 'sessions' }, hash: '#revoke' }),
      route('/'),
    )

    expect(mockNavigate).toHaveBeenCalledWith(
      { path: '/account/security', query: { tab: 'sessions' }, hash: '#revoke' },
      { redirectCode: 301 },
    )
  })
})
