// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import CouponField from './CouponField.vue'

/**
 * Pins the coupon-field UI contract against a stubbed `useValidateCoupon`. The
 * validation HTTP call is exercised end-to-end on the backend; here we assert
 * the entry/applied state toggle, the success/failure emits, and the
 * re-validate-on-currency-change behaviour.
 *
 * `useValidateCoupon` returns `{ mutateAsync, isLoading }`; the mock factory is
 * hoisted, so the refs/spies live at module scope and the factory closes over
 * them (the `vi.hoisted`-can't-reference-`ref` pattern from the testing rules).
 */

const mutateAsync = vi.fn()
const isLoadingRef = ref(false)

mockNuxtImport('useValidateCoupon', () => () => ({
  mutateAsync,
  isLoading: isLoadingRef,
}))

beforeEach(() => {
  mutateAsync.mockReset()
  isLoadingRef.value = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('CheckoutCouponField', () => {
  it('renders the entry form with apply disabled until a code is typed', async () => {
    const wrapper = await mountSuspended(CouponField, {
      props: { subtotal: 100, currency: 'USD', modelValue: null },
    })
    expect(wrapper.find('[data-testid="coupon-entry"]').exists()).toBe(true)
    const apply = wrapper.find('[data-testid="coupon-apply"]')
    expect(apply.attributes('disabled')).toBeDefined()
  })

  it('validates and emits the applied coupon on apply', async () => {
    mutateAsync.mockResolvedValue({
      code: 'SAVE10',
      discount_type: 'percent',
      discount_amount: 10,
      currency: 'USD',
    })
    const wrapper = await mountSuspended(CouponField, {
      props: { subtotal: 100, currency: 'USD', modelValue: null },
    })
    await wrapper.find('input').setValue('save10')
    await wrapper.find('[data-testid="coupon-entry"]').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    expect(mutateAsync).toHaveBeenCalledWith({ code: 'save10', subtotal: 100, currency: 'USD' })
    const emits = wrapper.emitted('update:modelValue')
    expect(emits?.at(-1)?.[0]).toEqual({ code: 'SAVE10', discountAmount: 10 })
  })

  it('emits null and shows the backend reason on a rejected code', async () => {
    mutateAsync.mockRejectedValue({ data: { detail: 'This coupon has expired.' } })
    const wrapper = await mountSuspended(CouponField, {
      props: { subtotal: 100, currency: 'USD', modelValue: null },
    })
    await wrapper.find('input').setValue('OLD')
    await wrapper.find('[data-testid="coupon-entry"]').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBeNull()
    expect(wrapper.find('[data-testid="coupon-error"]').text()).toContain('expired')
  })

  it('renders the applied state with the code and a remove button', async () => {
    const wrapper = await mountSuspended(CouponField, {
      props: {
        subtotal: 100,
        currency: 'USD',
        modelValue: { code: 'SAVE10', discountAmount: 10 },
      },
    })
    expect(wrapper.find('[data-testid="coupon-applied"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('SAVE10')
    expect(wrapper.find('[data-testid="coupon-entry"]').exists()).toBe(false)
  })

  it('emits null when remove is clicked', async () => {
    const wrapper = await mountSuspended(CouponField, {
      props: {
        subtotal: 100,
        currency: 'USD',
        modelValue: { code: 'SAVE10', discountAmount: 10 },
      },
    })
    await wrapper.find('[data-testid="coupon-remove"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBeNull()
  })

  it('re-validates an applied coupon when the currency changes', async () => {
    mutateAsync.mockResolvedValue({
      code: 'SAVE10',
      discount_type: 'percent',
      discount_amount: 42,
      currency: 'PLN',
    })
    const wrapper = await mountSuspended(CouponField, {
      props: {
        subtotal: 100,
        currency: 'USD',
        modelValue: { code: 'SAVE10', discountAmount: 10 },
      },
    })
    await wrapper.setProps({ currency: 'PLN' })
    await new Promise(r => setTimeout(r, 0))

    expect(mutateAsync).toHaveBeenCalledWith({ code: 'SAVE10', subtotal: 100, currency: 'PLN' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      code: 'SAVE10',
      discountAmount: 42,
    })
  })
})
