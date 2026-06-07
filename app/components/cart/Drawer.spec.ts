// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import Drawer from './Drawer.vue'

// USlideover teleports its content to <body> when open, so assertions read from
// document.body (same pattern as the admin dialog specs).
const { state, openDrawer, closeDrawer, setQuantity, remove } = vi.hoisted(() => ({
  state: { items: [] as unknown[], isEmpty: true, isOpen: true },
  openDrawer: vi.fn(),
  closeDrawer: vi.fn(),
  setQuantity: vi.fn(),
  remove: vi.fn(),
}))
mockNuxtImport('useCartStore', () => () => ({
  get items() { return state.items },
  get isEmpty() { return state.isEmpty },
  get isOpen() { return state.isOpen },
  openDrawer,
  closeDrawer,
  setQuantity,
  remove,
}))
mockNuxtImport('useCurrencyPreference', () => () => ({
  currency: { value: 'USD' },
  setCurrency: vi.fn(),
  currencies: [{ code: 'USD', symbol: '$' }, { code: 'PLN', symbol: 'zł' }, { code: 'EUR', symbol: '€' }],
}))

const AXE_OPTIONS = { rules: { 'region': { enabled: false }, 'aria-hidden-focus': { enabled: false } } }

function line() {
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
  }
}

beforeEach(() => {
  state.items = []
  state.isEmpty = true
  state.isOpen = true
  document.body.innerHTML = ''
})

describe('CartDrawer', () => {
  it('shows the empty state when the cart has no items', async () => {
    await mountSuspended(Drawer)
    expect(document.body.textContent).toContain('Your cart is empty')
  })

  it('lists items and the checkout action when the cart has items', async () => {
    state.items = [line()]
    state.isEmpty = false
    await mountSuspended(Drawer)
    expect(document.body.textContent).toContain('Widget')
    expect(document.body.textContent).toContain('Proceed to checkout')
  })

  it('shows the variant title on variant lines (variants F2)', async () => {
    state.items = [{ ...line(), variantId: 11, variantTitle: 'Red / XL', variantTitlePl: null }]
    state.isEmpty = false
    await mountSuspended(Drawer)
    expect(document.body.textContent).toContain('Red / XL')
  })

  it('is axe-clean when open with items', async () => {
    state.items = [line()]
    state.isEmpty = false
    await mountSuspended(Drawer)
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
