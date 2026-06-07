// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import AddToCartButton from './AddToCartButton.vue'

const { add, openDrawer, authState } = vi.hoisted(() => ({
  add: vi.fn(),
  openDrawer: vi.fn(),
  authState: { isImpersonating: false },
}))
mockNuxtImport('useCartStore', () => () => ({ add, openDrawer }))
mockNuxtImport('useAuthStore', () => () => ({
  get isImpersonating() {
    return authState.isImpersonating
  },
}))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Widget',
    slug: 'widget',
    description: null,
    sku: null,
    price_usd: 10,
    price_pln: 40,
    price_eur: 9,
    stock: 5,
    low_stock_threshold: null,
    is_active: true,
    is_featured: false,
    category_id: null,
    images: [],
    created_at: '',
    updated_at: '',
    in_stock: true,
    ...overrides,
  }
}

beforeEach(() => {
  add.mockReset()
  openDrawer.mockReset()
  authState.isImpersonating = false
})

describe('ShopAddToCartButton', () => {
  it('adds the product and opens the drawer on click', async () => {
    const wrapper = await mountSuspended(AddToCartButton, { props: { product: product() } })
    await wrapper.find('button').trigger('click')
    expect(add).toHaveBeenCalledTimes(1)
    expect(add.mock.calls[0]![0].id).toBe(1)
    expect(openDrawer).toHaveBeenCalledTimes(1)
  })

  it('is disabled and labelled out-of-stock when stock is 0', async () => {
    const wrapper = await mountSuspended(AddToCartButton, {
      props: { product: product({ stock: 0 }) },
    })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Out of Stock')
  })

  it('stays enabled with a backorder label when out of stock but backorder is allowed', async () => {
    const wrapper = await mountSuspended(AddToCartButton, {
      props: { product: product({ stock: 0, allow_backorder: true }) },
    })
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('backorder')
    await wrapper.find('button').trigger('click')
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('is disabled and does not add to cart while impersonating', async () => {
    authState.isImpersonating = true
    const wrapper = await mountSuspended(AddToCartButton, { props: { product: product() } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    await wrapper.find('button').trigger('click')
    expect(add).not.toHaveBeenCalled()
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(AddToCartButton, { props: { product: product() } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })

  describe('variants (F2)', () => {
    const variant = {
      id: 11,
      title: 'Red / XL',
      title_pl: null,
      sku: 'W-RED-XL',
      price_usd: 12,
      price_pln: 48,
      price_eur: 11,
      image_id: null,
      image_url: null,
      stock: 3,
      in_stock: true,
      option_value_ids: [1, 2],
    }

    it('is disabled with a select-options label when the product has variants and none is resolved', async () => {
      const wrapper = await mountSuspended(AddToCartButton, {
        props: { product: product({ has_variants: true }) },
      })
      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Select options')
      await wrapper.find('button').trigger('click')
      expect(add).not.toHaveBeenCalled()
    })

    it('adds the resolved variant to the cart', async () => {
      const wrapper = await mountSuspended(AddToCartButton, {
        props: { product: product({ has_variants: true }), variant },
      })
      expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
      await wrapper.find('button').trigger('click')
      expect(add).toHaveBeenCalledTimes(1)
      expect(add.mock.calls[0]![0].id).toBe(1)
      expect(add.mock.calls[0]![2].id).toBe(11)
      expect(openDrawer).toHaveBeenCalledTimes(1)
    })

    it('is disabled and labelled out-of-stock when the resolved variant has no stock', async () => {
      const wrapper = await mountSuspended(AddToCartButton, {
        props: {
          // Product-level stock is the sum (positive) — the VARIANT grain rules.
          product: product({ has_variants: true, stock: 10 }),
          variant: { ...variant, stock: 0, in_stock: false },
        },
      })
      expect(wrapper.find('button').attributes('disabled')).toBeDefined()
      expect(wrapper.text()).toContain('Out of Stock')
    })

    it('offers backorder for an out-of-stock variant when the product allows it', async () => {
      const wrapper = await mountSuspended(AddToCartButton, {
        props: {
          product: product({ has_variants: true, stock: 0, allow_backorder: true }),
          variant: { ...variant, stock: 0, in_stock: false },
        },
      })
      expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
      expect(wrapper.text()).toContain('backorder')
    })
  })
})
