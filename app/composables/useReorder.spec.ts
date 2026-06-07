import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCartStore } from '~/stores/cart'

/**
 * "Buy again" reorder flow. Each spec mocks `useApi` (the per-line current
 * product lookup) + `useToast`, drives the real client cart store, and asserts
 * the cart hydrates from CURRENT product data (not the order's historical
 * price), unavailable/out-of-stock lines are skipped, and the summary toast
 * matches the added/skipped tally.
 */

const apiFetch = vi.fn()
const toastAdd = vi.fn()

vi.mock('~/composables/useApi', () => ({
  useApi: () => ({ apiFetch }),
}))

vi.mock('vue-i18n', () => ({
  // Return the key (+ interpolation params appended) so specs can assert which
  // toast copy fired without depending on the bundled English strings.
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) }),
}))

// `useToast` is a Nuxt auto-import that resolves to @nuxt/ui's composable;
// under happy-dom the real one needs a live Nuxt app instance, so mock the
// source module to return our spy.
vi.mock('@nuxt/ui/runtime/composables/useToast.js', () => ({
  useToast: () => ({ add: toastAdd }),
}))

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    slug: 'widget',
    name: 'Widget',
    images: [],
    price_usd: 10,
    price_pln: 40,
    price_eur: 9,
    stock: 5,
    is_active: true,
    allow_backorder: false,
    ...overrides,
  }
}

function line(overrides: Record<string, unknown> = {}) {
  return { product_id: 1, quantity: 1, product_name: 'Widget', ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  try {
    globalThis.localStorage?.clear()
  }
  catch {
    // localStorage unavailable in this env — nothing to clear.
  }
  setActivePinia(createPinia())
})

async function importReorder() {
  const { useReorder } = await import('./useReorder')
  return useReorder()
}

describe('useReorder', () => {
  it('adds resolvable items to the cart at current prices', async () => {
    // The order line's historical price is irrelevant — the current product
    // (price_usd 12, not the snapshot) is what lands in the cart.
    apiFetch.mockResolvedValue(product({ id: 7, name: 'Gadget', price_usd: 12, stock: 5 }))
    const cart = useCartStore()
    const { reorder } = await importReorder()

    const result = await reorder([line({ product_id: 7, quantity: 2, product_name: 'Gadget' })])

    expect(result).toEqual({ added: 1, skipped: 0 })
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0]).toMatchObject({ productId: 7, name: 'Gadget', price_usd: 12, quantity: 2 })
    expect(cart.count).toBe(2)
  })

  it('re-resolves the CURRENT price, never the order line price', async () => {
    apiFetch.mockResolvedValue(product({ id: 1, price_usd: 99, stock: 3 }))
    const cart = useCartStore()
    const { reorder } = await importReorder()

    // Order line carries no price at all — proves we never trust it.
    await reorder([line({ product_id: 1, quantity: 1 })])

    expect(cart.items[0]?.price_usd).toBe(99)
  })

  it('skips out-of-stock (non-backorder) items', async () => {
    apiFetch.mockResolvedValue(product({ stock: 0, allow_backorder: false }))
    const cart = useCartStore()
    const { reorder } = await importReorder()

    const result = await reorder([line()])

    expect(result).toEqual({ added: 0, skipped: 1 })
    expect(cart.items).toHaveLength(0)
  })

  it('adds an out-of-stock item when backorder is allowed', async () => {
    apiFetch.mockResolvedValue(product({ stock: 0, allow_backorder: true }))
    const cart = useCartStore()
    const { reorder } = await importReorder()

    const result = await reorder([line({ quantity: 3 })])

    expect(result).toEqual({ added: 1, skipped: 0 })
    expect(cart.items[0]).toMatchObject({ quantity: 3, allowBackorder: true })
  })

  it('skips inactive products', async () => {
    apiFetch.mockResolvedValue(product({ is_active: false, stock: 5 }))
    const cart = useCartStore()
    const { reorder } = await importReorder()

    const result = await reorder([line()])

    expect(result).toEqual({ added: 0, skipped: 1 })
    expect(cart.items).toHaveLength(0)
  })

  it('skips products that no longer exist (fetch rejects)', async () => {
    apiFetch.mockRejectedValue({ status: 404 })
    const cart = useCartStore()
    const { reorder } = await importReorder()

    const result = await reorder([line()])

    expect(result).toEqual({ added: 0, skipped: 1 })
    expect(cart.items).toHaveLength(0)
  })

  it('mixes added and skipped lines and reports both', async () => {
    apiFetch
      .mockResolvedValueOnce(product({ id: 1, stock: 5 }))
      .mockResolvedValueOnce(product({ id: 2, stock: 0, allow_backorder: false }))
    const cart = useCartStore()
    const { reorder } = await importReorder()

    const result = await reorder([
      line({ product_id: 1 }),
      line({ product_id: 2, product_name: 'Sold out' }),
    ])

    expect(result).toEqual({ added: 1, skipped: 1 })
    expect(cart.count).toBe(1)
  })

  it('fires the all-added toast when nothing is skipped', async () => {
    apiFetch.mockResolvedValue(product({ stock: 5 }))
    const { reorder } = await importReorder()

    await reorder([line()])

    expect(toastAdd).toHaveBeenCalledTimes(1)
    expect(toastAdd.mock.calls[0]?.[0]).toMatchObject({ color: 'success' })
    expect(toastAdd.mock.calls[0]?.[0].title).toContain('orders.reorder.toast.allAddedTitle')
  })

  it('fires the partial toast when some items are skipped', async () => {
    apiFetch
      .mockResolvedValueOnce(product({ id: 1, stock: 5 }))
      .mockResolvedValueOnce(product({ id: 2, stock: 0 }))
    const { reorder } = await importReorder()

    await reorder([line({ product_id: 1 }), line({ product_id: 2 })])

    expect(toastAdd.mock.calls[0]?.[0]).toMatchObject({ color: 'warning' })
    expect(toastAdd.mock.calls[0]?.[0].title).toContain('orders.reorder.toast.partialTitle')
  })

  it('fires the none toast when nothing could be added', async () => {
    apiFetch.mockResolvedValue(product({ stock: 0 }))
    const { reorder } = await importReorder()

    await reorder([line()])

    expect(toastAdd.mock.calls[0]?.[0]).toMatchObject({ color: 'error' })
    expect(toastAdd.mock.calls[0]?.[0].title).toContain('orders.reorder.toast.noneTitle')
  })

  it('opens the cart drawer when at least one item is added', async () => {
    apiFetch.mockResolvedValue(product({ stock: 5 }))
    const cart = useCartStore()
    const { reorder } = await importReorder()

    await reorder([line()])

    expect(cart.isOpen).toBe(true)
  })

  it('does not open the drawer when nothing is added', async () => {
    apiFetch.mockResolvedValue(product({ stock: 0 }))
    const cart = useCartStore()
    const { reorder } = await importReorder()

    await reorder([line()])

    expect(cart.isOpen).toBe(false)
  })

  it('toggles isReordering around the run', async () => {
    let resolve: (v: unknown) => void = () => {}
    apiFetch.mockReturnValue(new Promise((r) => {
      resolve = r
    }))
    const { reorder, isReordering } = await importReorder()

    const pending = reorder([line()])
    expect(isReordering.value).toBe(true)
    resolve(product({ stock: 5 }))
    await pending
    expect(isReordering.value).toBe(false)
  })

  describe('variants (F2)', () => {
    function variantFixture(overrides: Record<string, unknown> = {}) {
      return {
        id: 11,
        title: 'Red / XL',
        title_pl: null,
        sku: null,
        price_usd: 12,
        price_pln: 48,
        price_eur: 11,
        image_id: null,
        image_url: null,
        stock: 4,
        in_stock: true,
        option_value_ids: [1, 2],
        ...overrides,
      }
    }

    it('re-matches the variant on the current product and adds the variant line', async () => {
      apiFetch.mockResolvedValue(product({
        has_variants: true,
        variants: [variantFixture({ id: 11, price_usd: 12 })],
      }))
      const cart = useCartStore()
      const { reorder } = await importReorder()

      const result = await reorder([line({ variant_id: 11, quantity: 2 })])

      expect(result).toEqual({ added: 1, skipped: 0 })
      expect(cart.items[0]).toMatchObject({
        productId: 1,
        variantId: 11,
        variantTitle: 'Red / XL',
        price_usd: 12,
        quantity: 2,
      })
    })

    it('skips a variant that is gone or inactive (not in the public list)', async () => {
      apiFetch.mockResolvedValue(product({
        has_variants: true,
        variants: [variantFixture({ id: 99 })],
      }))
      const cart = useCartStore()
      const { reorder } = await importReorder()

      const result = await reorder([line({ variant_id: 11 })])

      expect(result).toEqual({ added: 0, skipped: 1 })
      expect(cart.items).toHaveLength(0)
    })

    it('skips an out-of-stock variant without backorder', async () => {
      apiFetch.mockResolvedValue(product({
        stock: 10, // product sum positive — the variant grain decides
        has_variants: true,
        variants: [variantFixture({ id: 11, stock: 0, in_stock: false })],
      }))
      const { reorder } = await importReorder()

      const result = await reorder([line({ variant_id: 11 })])

      expect(result).toEqual({ added: 0, skipped: 1 })
    })

    it('adds an out-of-stock variant when the product allows backorder', async () => {
      apiFetch.mockResolvedValue(product({
        stock: 0,
        allow_backorder: true,
        has_variants: true,
        variants: [variantFixture({ id: 11, stock: 0, in_stock: false })],
      }))
      const cart = useCartStore()
      const { reorder } = await importReorder()

      const result = await reorder([line({ variant_id: 11, quantity: 3 })])

      expect(result).toEqual({ added: 1, skipped: 0 })
      expect(cart.items[0]).toMatchObject({ variantId: 11, quantity: 3 })
    })

    it('skips a variantless line whose product has since gained variants', async () => {
      apiFetch.mockResolvedValue(product({
        has_variants: true,
        variants: [variantFixture()],
      }))
      const cart = useCartStore()
      const { reorder } = await importReorder()

      const result = await reorder([line()])

      expect(result).toEqual({ added: 0, skipped: 1 })
      expect(cart.items).toHaveLength(0)
    })
  })
})
