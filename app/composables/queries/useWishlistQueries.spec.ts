import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PiniaColada } from '@pinia/colada'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { WishlistItem } from './useWishlistQueries'

/**
 * Colada-backed query/mutation layer for the wishlist. Specs assert on the URLs
 * + verbs pushed at `apiFetch`, plus the `isInWishlist`/`findItem` membership
 * helpers derived from the loaded list.
 */

const apiFetch = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

// `useWishlist` reads the auth store to gate the list query; an authenticated
// user keeps the query enabled so the list resolves.
vi.mock('~/stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function runInComponent(setupFn: () => unknown) {
  let captured: unknown
  const harness = defineComponent({
    setup() {
      captured = setupFn()
      return () => h('div')
    },
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  mount(harness, {
    global: {
      plugins: [pinia, PiniaColada],
    },
  })
  await nextTick()
  return captured
}

const ITEM = (over: Partial<WishlistItem> = {}): WishlistItem => ({
  id: 1,
  created_at: '2026-06-08T10:00:00Z',
  updated_at: '2026-06-08T10:00:00Z',
  product_id: 42,
  variant_id: null,
  product_slug: 'blue-mug',
  product_name: 'Blue Mug',
  product_name_pl: null,
  product_image_url: null,
  price_usd: 12,
  price_pln: 48,
  price_eur: 11,
  is_active: true,
  in_stock: true,
  variant_sku: null,
  variant_title: null,
  ...over,
})

describe('useWishlistQuery', () => {
  it('fetches /api/v1/wishlist', async () => {
    apiFetch.mockResolvedValue([])
    const { useWishlistQuery } = await import('./useWishlistQueries')

    await runInComponent(() => useWishlistQuery())
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/wishlist')
  })

  it('does not fetch when disabled', async () => {
    const { useWishlistQuery } = await import('./useWishlistQueries')

    await runInComponent(() => useWishlistQuery(false))
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(apiFetch).not.toHaveBeenCalled()
  })
})

describe('useAddToWishlist', () => {
  it('POSTs /api/v1/wishlist with product_id + variant_id', async () => {
    apiFetch.mockResolvedValue(ITEM())
    const { useAddToWishlist } = await import('./useWishlistQueries')

    const result = await runInComponent(() => useAddToWishlist()) as any
    await result.mutateAsync({ product_id: 42, variant_id: 7 })

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/wishlist')
    expect(options.method).toBe('POST')
    expect(options.body).toMatchObject({ product_id: 42, variant_id: 7 })
  })
})

describe('useRemoveFromWishlist', () => {
  it('DELETEs /api/v1/wishlist/{id}', async () => {
    apiFetch.mockResolvedValue(undefined)
    const { useRemoveFromWishlist } = await import('./useWishlistQueries')

    const result = await runInComponent(() => useRemoveFromWishlist()) as any
    await result.mutateAsync(9)

    const [url, options] = apiFetch.mock.calls[0]!
    expect(url).toBe('/api/v1/wishlist/9')
    expect(options.method).toBe('DELETE')
  })
})

describe('useWishlist — membership helpers', () => {
  it('isInWishlist / findItem key on (product_id, variant_id)', async () => {
    apiFetch.mockResolvedValue([
      ITEM({ id: 1, product_id: 42, variant_id: null }),
      ITEM({ id: 2, product_id: 99, variant_id: 5 }),
    ])
    const { useWishlist } = await import('./useWishlistQueries')

    const wl = await runInComponent(() => useWishlist()) as ReturnType<
      typeof import('./useWishlistQueries')['useWishlist']
    >
    await nextTick()
    await new Promise(r => setTimeout(r, 0))

    expect(wl.items.value).toHaveLength(2)
    // product-grain save matches with no variant.
    expect(wl.isInWishlist(42)).toBe(true)
    expect(wl.findItem(42)?.id).toBe(1)
    // the same product pinned to a different variant is NOT saved.
    expect(wl.isInWishlist(42, 5)).toBe(false)
    // variant-pinned save matches only its exact variant.
    expect(wl.isInWishlist(99, 5)).toBe(true)
    expect(wl.isInWishlist(99)).toBe(false)
    // an unsaved product.
    expect(wl.isInWishlist(7)).toBe(false)
  })
})
