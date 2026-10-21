// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import LineItem from './LineItem.vue'
import type { CartItem } from '~/stores/cart'

const { setQuantity, remove } = vi.hoisted(() => ({ setQuantity: vi.fn(), remove: vi.fn() }))
mockNuxtImport('useCartStore', () => () => ({ setQuantity, remove }))
mockNuxtImport('useCurrencyPreference', () => () => ({
  currency: { value: 'USD' },
  setCurrency: vi.fn(),
  currencies: [{ code: 'USD', symbol: '$' }, { code: 'PLN', symbol: 'zł' }, { code: 'EUR', symbol: '€' }],
}))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 1,
    slug: 'widget',
    name: 'Widget',
    imageUrl: null,
    price_usd: 10,
    price_pln: 40,
    price_eur: 9,
    stock: 5,
    allowBackorder: false,
    quantity: 2,
    ...overrides,
  }
}

beforeEach(() => {
  setQuantity.mockReset()
  remove.mockReset()
})

describe('CartLineItem', () => {
  it('renders the product name and quantity', async () => {
    const wrapper = await mountSuspended(LineItem, { props: { item: item() } })
    expect(wrapper.text()).toContain('Widget')
    expect(wrapper.text()).toContain('2')
  })

  it('increments and decrements quantity through the store', async () => {
    const wrapper = await mountSuspended(LineItem, { props: { item: item({ quantity: 2 }) } })
    await wrapper.find('button[aria-label="Increase quantity"]').trigger('click')
    expect(setQuantity).toHaveBeenCalledWith(1, null, 3)
    await wrapper.find('button[aria-label="Decrease quantity"]').trigger('click')
    expect(setQuantity).toHaveBeenCalledWith(1, null, 1)
  })

  it('caps the increase button at stock for a normal line', async () => {
    const wrapper = await mountSuspended(LineItem, {
      props: { item: item({ stock: 2, quantity: 2 }) },
    })
    expect(wrapper.find('button[aria-label="Increase quantity"]').attributes('disabled'))
      .toBeDefined()
  })

  it('does not cap the increase button for a backorder line at/over stock', async () => {
    const wrapper = await mountSuspended(LineItem, {
      props: { item: item({ stock: 0, quantity: 1, allowBackorder: true }) },
    })
    expect(wrapper.find('button[aria-label="Increase quantity"]').attributes('disabled'))
      .toBeUndefined()
  })

  it('removes the line through the store', async () => {
    const wrapper = await mountSuspended(LineItem, { props: { item: item() } })
    await wrapper.find('button[aria-label="Remove"]').trigger('click')
    expect(remove).toHaveBeenCalledWith(1, null)
  })

  it('shows the variant title under the name and routes mutations to the variant line', async () => {
    const wrapper = await mountSuspended(LineItem, {
      props: { item: item({ variantId: 11, variantTitle: 'Red / XL', quantity: 2 }) },
    })
    expect(wrapper.find('[data-testid="line-variant-title"]').text()).toBe('Red / XL')
    await wrapper.find('button[aria-label="Increase quantity"]').trigger('click')
    expect(setQuantity).toHaveBeenCalledWith(1, 11, 3)
    await wrapper.find('button[aria-label="Remove"]').trigger('click')
    expect(remove).toHaveBeenCalledWith(1, 11)
  })

  it('renders no variant row for a variantless line', async () => {
    const wrapper = await mountSuspended(LineItem, { props: { item: item() } })
    expect(wrapper.find('[data-testid="line-variant-title"]').exists()).toBe(false)
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(LineItem, { props: { item: item() } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
