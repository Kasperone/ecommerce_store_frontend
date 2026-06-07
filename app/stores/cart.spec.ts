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
    cart.setQuantity(1, null, 10)
    expect(cart.items[0]!.quantity).toBe(4)
    cart.setQuantity(1, null, 0)
    expect(cart.isEmpty).toBe(true)
  })

  it('adds a backorder product that is out of stock', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 0, allow_backorder: true }))
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0]).toMatchObject({ quantity: 1, allowBackorder: true })
  })

  it('does not cap quantity for backorder products', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 2, allow_backorder: true }), 5)
    expect(cart.items[0]!.quantity).toBe(5)
    cart.add(product({ stock: 2, allow_backorder: true }), 3)
    expect(cart.items[0]!.quantity).toBe(8)
  })

  it('setQuantity is not clamped for backorder lines', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 2, allow_backorder: true }))
    cart.setQuantity(1, null, 10)
    expect(cart.items[0]!.quantity).toBe(10)
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

  it('snapshots weight_kg on add (drives the checkout shipping quote)', () => {
    const cart = useCartStore()
    cart.add(product({ id: 1, weight_kg: 1.5 }))
    cart.add(product({ id: 2, slug: 'gadget', weight_kg: null }))
    expect(cart.items[0]!.weightKg).toBe(1.5)
    expect(cart.items[1]!.weightKg).toBeNull()
  })

  it('omitted weight_kg snapshots as null (legacy products)', () => {
    const cart = useCartStore()
    cart.add(product()) // no weight_kg in fixture
    expect(cart.items[0]!.weightKg).toBeNull()
  })

  it('snapshots dimensions on add (drives the checkout volumetric quote)', () => {
    const cart = useCartStore()
    cart.add(product({ id: 1, length_cm: 60, width_cm: 60, height_cm: 30 }))
    expect(cart.items[0]).toMatchObject({
      lengthCm: 60,
      widthCm: 60,
      heightCm: 30,
    })
  })

  it('omitted dimensions snapshot as null (legacy products)', () => {
    const cart = useCartStore()
    cart.add(product()) // no length/width/height_cm in fixture
    expect(cart.items[0]).toMatchObject({
      lengthCm: null,
      widthCm: null,
      heightCm: null,
    })
  })

  it('partially-set dimensions still snapshot each field independently', () => {
    // Convention is "all three set or none," but a half-populated row from
    // the API should still snapshot defensively — the backend resolver
    // treats any-NULL as 0 volumetric contribution anyway.
    const cart = useCartStore()
    cart.add(product({ id: 1, length_cm: 60 })) // width + height missing
    expect(cart.items[0]).toMatchObject({
      lengthCm: 60,
      widthCm: null,
      heightCm: null,
    })
  })
})

// ---------------------------------------------------------------------------
// Variants (F2) — line identity is the (productId, variantId) pair.
// ---------------------------------------------------------------------------

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    title: 'Red / XL',
    title_pl: 'Czerwony / XL',
    sku: 'W-RED-XL',
    price_usd: 12,
    price_pln: 48,
    price_eur: 11,
    image_id: null,
    image_url: null,
    stock: 3,
    in_stock: true,
    option_value_ids: [1, 2],
    ...overrides,
    // Loose test fixture for ProductVariantPublic.
  } as never
}

describe('useCartStore — variants', () => {
  it('snapshots the variant id, titles, prices and stock on the line', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 99 }), 1, variant())
    expect(cart.items[0]).toMatchObject({
      productId: 1,
      variantId: 11,
      variantTitle: 'Red / XL',
      variantTitlePl: 'Czerwony / XL',
      price_usd: 12,
      price_pln: 48,
      price_eur: 11,
      stock: 3,
    })
  })

  it('keeps separate lines per variant of the same product', () => {
    const cart = useCartStore()
    cart.add(product(), 1, variant({ id: 11 }))
    cart.add(product(), 1, variant({ id: 12, title: 'Blue / XL' }))
    expect(cart.items).toHaveLength(2)
    cart.add(product(), 1, variant({ id: 11 }))
    expect(cart.items).toHaveLength(2)
    expect(cart.items[0]!.quantity).toBe(2)
  })

  it('keeps a variant line distinct from a variantless line of the same product', () => {
    const cart = useCartStore()
    cart.add(product())
    cart.add(product(), 1, variant())
    expect(cart.items).toHaveLength(2)
    expect(cart.items.map(i => i.variantId ?? null)).toEqual([null, 11])
  })

  it('clamps quantity to the VARIANT stock, not the product sum', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 50 }), 10, variant({ stock: 2 }))
    expect(cart.items[0]!.quantity).toBe(2)
  })

  it('blocks an out-of-stock variant without backorder even when the product sum is positive', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 50 }), 1, variant({ stock: 0, in_stock: false }))
    expect(cart.isEmpty).toBe(true)
  })

  it('adds an out-of-stock variant when the product allows backorder', () => {
    const cart = useCartStore()
    cart.add(product({ stock: 0, allow_backorder: true }), 2, variant({ stock: 0, in_stock: false }))
    expect(cart.items[0]).toMatchObject({ variantId: 11, quantity: 2, allowBackorder: true })
  })

  it('uses the variant image when it has one', () => {
    const cart = useCartStore()
    cart.add(
      product({ images: [{ url: 'https://cdn/prod.jpg', is_primary: true }] }),
      1,
      variant({ image_url: 'https://cdn/variant.jpg' }),
    )
    expect(cart.items[0]!.imageUrl).toBe('https://cdn/variant.jpg')
  })

  it('removes and setQuantity target only the matching (product, variant) line', () => {
    const cart = useCartStore()
    cart.add(product())
    cart.add(product(), 1, variant())
    cart.setQuantity(1, 11, 3)
    expect(cart.items.find(i => i.variantId === 11)!.quantity).toBe(3)
    expect(cart.items.find(i => i.variantId === null)!.quantity).toBe(1)
    cart.remove(1, 11)
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0]!.variantId).toBeNull()
  })

  it('merges into an old persisted line missing the variantId key (back-compat)', () => {
    // Pre-variants persisted carts have NO variantId key at all. A variantless
    // add must merge into that line, not duplicate it (risk 4).
    const legacy = [{
      productId: 1,
      slug: 'widget',
      name: 'Widget',
      imageUrl: null,
      price_usd: 10,
      price_pln: 40,
      price_eur: 9,
      stock: 5,
      allowBackorder: false,
      quantity: 1,
    }]
    try {
      globalThis.localStorage?.setItem('cart', JSON.stringify(legacy))
    }
    catch {
      // localStorage unavailable — the seeded-hydration path can't run here.
    }
    const cart = useCartStore()
    if (cart.items.length === 0) {
      // Env without localStorage: seed the same legacy shape directly.
      cart.items.push(legacy[0] as never)
    }
    cart.add(product())
    expect(cart.items).toHaveLength(1)
    expect(cart.items[0]!.quantity).toBe(2)
    // setQuantity/remove with a null variantId also hit the legacy line.
    cart.setQuantity(1, null, 4)
    expect(cart.items[0]!.quantity).toBe(4)
    cart.remove(1, null)
    expect(cart.isEmpty).toBe(true)
  })
})
