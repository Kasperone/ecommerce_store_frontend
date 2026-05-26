// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import PriceDisplay from './PriceDisplay.vue'

// Control the chosen currency by mocking the preference composable (its own
// logic is covered in useCurrencyPreference.spec.ts; selectPrice/formatMoney in
// money.spec.ts). Here we assert the component wires them together per currency.
const { currencyRef } = vi.hoisted(() => ({ currencyRef: { value: 'USD' } }))
mockNuxtImport('useCurrencyPreference', () => () => ({
  currency: currencyRef,
  setCurrency: vi.fn(),
  currencies: [
    { code: 'USD', symbol: '$' },
    { code: 'PLN', symbol: 'zł' },
    { code: 'EUR', symbol: '€' },
  ],
}))

const priced = { price_usd: 10, price_pln: 40, price_eur: 9 }

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

beforeEach(() => {
  currencyRef.value = 'USD'
})

describe('ShopPriceDisplay', () => {
  it('formats the price in the selected currency (USD)', async () => {
    const wrapper = await mountSuspended(PriceDisplay, { props: { product: priced } })
    expect(wrapper.text()).toContain('$')
    expect(wrapper.text()).toContain('10')
  })

  it('formats in PLN when PLN is selected', async () => {
    currencyRef.value = 'PLN'
    const wrapper = await mountSuspended(PriceDisplay, { props: { product: priced } })
    expect(wrapper.text()).toMatch(/40/)
  })

  it('shows an em dash when no price is set', async () => {
    const wrapper = await mountSuspended(PriceDisplay, {
      props: { product: { price_usd: null, price_pln: null, price_eur: null } },
    })
    expect(wrapper.text()).toContain('—')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(PriceDisplay, { props: { product: priced } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
