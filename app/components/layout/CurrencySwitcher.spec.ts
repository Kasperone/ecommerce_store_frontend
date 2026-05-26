// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import CurrencySwitcher from './CurrencySwitcher.vue'

const { currencyRef, setCurrency } = vi.hoisted(() => ({
  currencyRef: { value: 'USD' },
  setCurrency: vi.fn(),
}))
mockNuxtImport('useCurrencyPreference', () => () => ({
  currency: currencyRef,
  setCurrency,
  currencies: [
    { code: 'USD', symbol: '$' },
    { code: 'PLN', symbol: 'zł' },
    { code: 'EUR', symbol: '€' },
  ],
}))

const AXE_OPTIONS = { rules: { 'region': { enabled: false }, 'aria-hidden-focus': { enabled: false }, 'label': { enabled: false } } }

beforeEach(() => {
  currencyRef.value = 'USD'
  setCurrency.mockReset()
})

describe('LayoutCurrencySwitcher', () => {
  it('offers the three supported currencies', async () => {
    const wrapper = await mountSuspended(CurrencySwitcher)
    const select = wrapper.findComponent({ name: 'USelectMenu' })
    expect(select.exists()).toBe(true)
    expect(select.props('items')).toHaveLength(3)
  })

  it('calls setCurrency when a new currency is chosen', async () => {
    const wrapper = await mountSuspended(CurrencySwitcher)
    wrapper.findComponent({ name: 'USelectMenu' }).vm.$emit('update:modelValue', 'PLN')
    expect(setCurrency).toHaveBeenCalledWith('PLN')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(CurrencySwitcher)
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
