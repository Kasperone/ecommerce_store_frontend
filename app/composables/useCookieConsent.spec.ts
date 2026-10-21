// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

/**
 * `useCookieConsent` — the shared consent state + actions consumed by the banner
 * and (via B6) the footer "Cookie settings" control.
 *
 * We mock the framework auto-imports so no backend / real cookie jar is needed:
 *
 * - `useCookie` → backed by plain `{ value }` stores keyed by name, mirroring the
 *   `useCurrencyPreference` spec. The composable reads/writes these refs directly.
 * - `useState` → a per-key ref registry so the SSR-shared state behaves like a
 *   live ref (the composable `watch`es none of these directly in a way that needs
 *   reactivity, but real `ref()` keeps assignment semantics intact).
 * - `useApi` → captures the POST so we can assert the payload (anon_id, gpc,
 *   categories, policy_version).
 *
 * `navigator.globalPrivacyControl` + `crypto.randomUUID` are stubbed per-test to
 * exercise the GPC default-off path and anon-id minting.
 */

const { cookieStore, stateStore, mockApiFetch } = vi.hoisted(() => ({
  cookieStore: new Map<string, { value: unknown }>(),
  stateStore: new Map<string, { value: unknown }>(),
  mockApiFetch: vi.fn(),
}))

mockNuxtImport('useCookie', () => (key: string, opts?: { default?: () => unknown }) => {
  if (!cookieStore.has(key)) {
    cookieStore.set(key, { value: opts?.default ? opts.default() : null })
  }
  return cookieStore.get(key)!
})

mockNuxtImport('useState', () => (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, ref(init ? init() : undefined))
  }
  return stateStore.get(key)!
})

mockNuxtImport('useApi', () => () => ({ apiFetch: mockApiFetch }))

async function loadComposable() {
  const mod = await import('./useCookieConsent')
  return mod
}

function setGpc(value: boolean | undefined) {
  Object.defineProperty(globalThis.navigator, 'globalPrivacyControl', {
    value,
    configurable: true,
  })
}

beforeEach(() => {
  cookieStore.clear()
  stateStore.clear()
  mockApiFetch.mockReset()
  mockApiFetch.mockResolvedValue({})
  setGpc(undefined)
  // Deterministic anon id.
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
    '11111111-1111-1111-1111-111111111111' as `${string}-${string}-${string}-${string}-${string}`,
  )
})

describe('useCookieConsent', () => {
  it('exposes the documented public API', async () => {
    const { useCookieConsent } = await loadComposable()
    const c = useCookieConsent()
    expect(typeof c.openSettings).toBe('function')
    expect(typeof c.acceptAll).toBe('function')
    expect(typeof c.rejectAll).toBe('function')
    expect(typeof c.save).toBe('function')
    expect(c.categories).toBeDefined()
    expect(c.hasDecided).toBeDefined()
    expect(c.isOpen).toBeDefined()
    expect(c.gpc).toBeDefined()
  })

  it('starts undecided with no cookie present', async () => {
    const { useCookieConsent } = await loadComposable()
    const c = useCookieConsent()
    expect(c.hasDecided.value).toBe(false)
    expect(c.isOpen.value).toBe(false)
    expect(c.categories.value).toEqual({ necessary: true, analytics: false, marketing: false })
  })

  it('acceptAll POSTs all categories on, sets the cookie, and marks decided', async () => {
    const { useCookieConsent, COOKIE_POLICY_VERSION } = await loadComposable()
    const c = useCookieConsent()
    await c.acceptAll()

    expect(c.hasDecided.value).toBe(true)
    expect(c.isOpen.value).toBe(false)
    expect(c.categories.value).toEqual({ necessary: true, analytics: true, marketing: true })

    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockApiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/cookie-consent')
    expect(opts.method).toBe('POST')
    expect(opts.body).toMatchObject({
      categories: { necessary: true, analytics: true, marketing: true },
      gpc: false,
      policy_version: COOKIE_POLICY_VERSION,
      anon_id: '11111111-1111-1111-1111-111111111111',
    })
    // Cookie persisted so the banner won't re-show.
    expect(cookieStore.get('cookie_consent')!.value).toMatchObject({
      categories: { necessary: true, analytics: true, marketing: true },
      policy_version: COOKIE_POLICY_VERSION,
    })
  })

  it('rejectAll POSTs only necessary on', async () => {
    const { useCookieConsent } = await loadComposable()
    const c = useCookieConsent()
    await c.rejectAll()

    expect(c.categories.value).toEqual({ necessary: true, analytics: false, marketing: false })
    expect(mockApiFetch.mock.calls[0]![1].body.categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    })
  })

  it('save honours an explicit category selection (necessary forced true)', async () => {
    const { useCookieConsent } = await loadComposable()
    const c = useCookieConsent()
    await c.save({ analytics: true, marketing: false })

    expect(c.categories.value).toEqual({ necessary: true, analytics: true, marketing: false })
    expect(mockApiFetch.mock.calls[0]![1].body.categories).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
    })
  })

  it('openSettings re-opens after a decision', async () => {
    const { useCookieConsent } = await loadComposable()
    const c = useCookieConsent()
    await c.acceptAll()
    expect(c.isOpen.value).toBe(false)

    c.openSettings()
    expect(c.isOpen.value).toBe(true)
    // Seeds the working copy from the stored decision.
    expect(c.categories.value).toEqual({ necessary: true, analytics: true, marketing: true })
  })

  it('GPC true defaults analytics + marketing off and sends gpc:true', async () => {
    setGpc(true)
    const { useCookieConsent } = await loadComposable()
    const c = useCookieConsent()
    expect(c.gpc.value).toBe(true)
    expect(c.categories.value).toEqual({ necessary: true, analytics: false, marketing: false })

    await c.save({})
    expect(mockApiFetch.mock.calls[0]![1].body.gpc).toBe(true)
  })

  it('hasDecided is true when a current-policy cookie is already present', async () => {
    const { useCookieConsent, COOKIE_POLICY_VERSION } = await loadComposable()
    cookieStore.set('cookie_consent', {
      value: {
        categories: { necessary: true, analytics: true, marketing: false },
        gpc: false,
        policy_version: COOKIE_POLICY_VERSION,
      },
    })
    const c = useCookieConsent()
    expect(c.hasDecided.value).toBe(true)
    expect(c.categories.value).toEqual({ necessary: true, analytics: true, marketing: false })
  })

  it('a stale-policy cookie is treated as undecided', async () => {
    const { useCookieConsent } = await loadComposable()
    cookieStore.set('cookie_consent', {
      value: {
        categories: { necessary: true, analytics: true, marketing: true },
        gpc: false,
        policy_version: '1999-01-01',
      },
    })
    const c = useCookieConsent()
    expect(c.hasDecided.value).toBe(false)
  })

  it('save tolerates a failing POST (cookie still written)', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network'))
    const { useCookieConsent } = await loadComposable()
    const c = useCookieConsent()
    await expect(c.acceptAll()).resolves.toBeUndefined()
    expect(c.hasDecided.value).toBe(true)
    expect(cookieStore.get('cookie_consent')!.value).toBeTruthy()
  })

  it('mints + persists an anon_id when none exists', async () => {
    const { useCookieConsent } = await loadComposable()
    const c = useCookieConsent()
    await c.acceptAll()
    expect(cookieStore.get('cookie_anon_id')!.value).toBe('11111111-1111-1111-1111-111111111111')
  })
})
