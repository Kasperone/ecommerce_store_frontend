import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCartStore } from './cart'

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
    ...overrides,
  }
}

beforeEach(() => {
  // The store persists to localStorage where it's available (e.g. CI), so clear
  // it between tests to stop one test's persisted cart hydrating into the next.
  // Guarded: some envs don't provide a working localStorage (the store no-ops it
  // there too), so a bare reference would throw.
  try {
    globalThis.localStorage?.clear()
  }
  catch {
    // localStorage unavailable in this env — nothing to clear.
  }
  setActivePinia(createPinia())
})

describe('useCartStore', () => {
  it('adds a new product as a line snapshot', () => {
    const cart = useCartStore()
    cart.add(product({ name: 'Widget', stock: 5 }))
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0]).toMatchObject({ productId: 1, name: 'Widget', quantity: 1 })
    expect(cart.count).toBe(1)
  })

  it('snapshots the primary image url', () => {
    const cart = useCartStore()
    cart.add(product({
      images: [
        { url: 'https://cdn/a.jpg', is_primary: false },
        { url: 'https://cdn/b.jpg', is_primary: true },
      ],
    }))
    expect(cart.items[0]!.imageUrl).toBe('https://cdn/b.jpg')
  })

  it('increments quantity when the same product is added again', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 5 }))
    cart.add(product({ stock: 5 }), 2)
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0]!.quantity).toBe(3)
    expect(cart.count).toBe(3)
  })

  it('caps quantity at available stock', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 2 }), 5)
    expect(cart.items[0]!.quantity).toBe(2)
    cart.add(product({ stock: 2 }), 5)
    expect(cart.items[0]!.quantity).toBe(2)
  })

  it('ignores out-of-stock products', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 0 }))
    expect(cart.isEmpty).toBe(true)
  })

  it('setQuantity clamps to stock and removes on zero', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 4 }))
    cart.setQuantity(1, 10)
    expect(cart.items[0]!.quantity).toBe(4)
    cart.setQuantity(1, 0)
    expect(cart.isEmpty).toBe(true)
  })

  it('removes and clears', () => {
    const cart = useCartStore()
    cart.add(product({ id: 1 }))
    cart.add(product({ id: 2, slug: 'gadget' }))
    cart.remove(1)
    expect(cart.items.map(i => i.productId)).toEqual([2])
    cart.clear()
    expect(cart.isEmpty).toBe(true)
  })

  it('toggles drawer open state', () => {
    const cart = useCartStore()
    expect(cart.isOpen).toBe(false)
    cart.openDrawer()
    expect(cart.isOpen).toBe(true)
    cart.closeDrawer()
    expect(cart.isOpen).toBe(false)
  })
})
