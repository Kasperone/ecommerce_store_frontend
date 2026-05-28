// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import AddToCartButton from './AddToCartButton.vue'

const { add, openDrawer } = vi.hoisted(() => ({ add: vi.fn(), openDrawer: vi.fn() }))
mockNuxtImport('useCartStore', () => () => ({ add, openDrawer }))

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

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(AddToCartButton, { props: { product: product() } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
