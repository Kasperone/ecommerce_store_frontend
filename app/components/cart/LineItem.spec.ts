// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import LineItem from './LineItem.vue'

const { setQuantity, remove } = vi.hoisted(() => ({ setQuantity: vi.fn(), remove: vi.fn() }))
mockNuxtImport('useCartStore', () => () => ({ setQuantity, remove }))
mockNuxtImport('useCurrencyPreference', () => () => ({
  currency: { value: 'USD' },
  setCurrency: vi.fn(),
  currencies: [{ code: 'USD', symbol: '$' }, { code: 'PLN', symbol: 'zł' }, { code: 'EUR', symbol: '€' }],
}))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function item(overrides: Record<string, unknown> = {}) {
  return {
    productId: 1,
    slug: 'widget',
    name: 'Widget',
    imageUrl: null,
    price_usd: 10,
    price_pln: 40,
    price_eur: 9,
    stock: 5,
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
    expect(setQuantity).toHaveBeenCalledWith(1, 3)
    await wrapper.find('button[aria-label="Decrease quantity"]').trigger('click')
    expect(setQuantity).toHaveBeenCalledWith(1, 1)
  })

  it('removes the line through the store', async () => {
    const wrapper = await mountSuspended(LineItem, { props: { item: item() } })
    await wrapper.find('button[aria-label="Remove"]').trigger('click')
    expect(remove).toHaveBeenCalledWith(1)
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(LineItem, { props: { item: item() } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
