// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import CouponField from './CouponField.vue'

/**
 * Pins the coupon-field UI contract against a stubbed `useValidateCoupon`. The
 * validation HTTP call is exercised end-to-end on the backend; here we assert
 * the entry/applied/automatic state toggle, the success/failure emits, the
 * re-validate-on-currency-change behaviour, and the debounced no-code preview
 * that surfaces automatic discounts without typing.
 *
 * `useValidateCoupon` returns `{ mutateAsync, isLoading }`; the mock factory is
 * hoisted, so the refs/spies live at module scope and the factory closes over
 * them (the `vi.hoisted`-can't-reference-`ref` pattern from the testing rules).
 *
 * The auto-preview debounce (300 ms) runs on real timers — preview-path tests
 * wait it out with `waitPreview()`; the manual apply/re-validate paths stay
 * immediate and use the usual 0 ms tick.
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

const tick = () => new Promise(r => setTimeout(r, 0))
// Outlasts the component's 300 ms auto-preview debounce.
const waitPreview = () => new Promise(r => setTimeout(r, 350))

const NOTHING_APPLIES = {
  code: null,
  discount_type: null,
  discount_amount: null,
  is_automatic: false,
  free_shipping: false,
  currency: 'USD',
}

const MANUAL_APPLIED = {
  code: 'SAVE10',
  discountAmount: 10,
  freeShipping: false,
  isAutomatic: false,
}

describe('CheckoutCouponField', () => {
  it('renders the entry form with apply disabled until a code is typed', async () => {
    const wrapper = await mountSuspended(CouponField, {
      props: { subtotal: 100, shippingAmount: 0, currency: 'USD', modelValue: null },
    })
    expect(wrapper.find('[data-testid="coupon-entry"]').exists()).toBe(true)
    const apply = wrapper.find('[data-testid="coupon-apply"]')
    expect(apply.attributes('disabled')).toBeDefined()
  })

  it('validates (incl. shipping_amount) and emits the applied coupon on apply', async () => {
    mutateAsync.mockResolvedValue({
      code: 'SAVE10',
      discount_type: 'percent',
      discount_amount: 10,
      is_automatic: false,
      free_shipping: false,
      currency: 'USD',
    })
    const wrapper = await mountSuspended(CouponField, {
      props: { subtotal: 100, shippingAmount: 12.5, currency: 'USD', modelValue: null },
    })
    await wrapper.find('input').setValue('save10')
    await wrapper.find('[data-testid="coupon-entry"]').trigger('submit')
    await tick()

    expect(mutateAsync).toHaveBeenCalledWith({
      code: 'save10',
      subtotal: 100,
      shipping_amount: 12.5,
      currency: 'USD',
    })
    const emits = wrapper.emitted('update:modelValue')
    expect(emits?.at(-1)?.[0]).toEqual({
      code: 'SAVE10',
      discountAmount: 10,
      freeShipping: false,
      isAutomatic: false,
    })
  })

  it('emits null and shows the backend reason on a rejected code', async () => {
    mutateAsync.mockRejectedValue({ data: { detail: 'This coupon has expired.' } })
    const wrapper = await mountSuspended(CouponField, {
      props: { subtotal: 100, shippingAmount: 0, currency: 'USD', modelValue: null },
    })
    await wrapper.find('input').setValue('OLD')
    await wrapper.find('[data-testid="coupon-entry"]').trigger('submit')
    await tick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBeNull()
    expect(wrapper.find('[data-testid="coupon-error"]').text()).toContain('expired')
  })

  it('renders the applied state with the code and a remove button', async () => {
    const wrapper = await mountSuspended(CouponField, {
      props: {
        subtotal: 100,
        shippingAmount: 0,
        currency: 'USD',
        modelValue: { ...MANUAL_APPLIED },
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
        shippingAmount: 0,
        currency: 'USD',
        modelValue: { ...MANUAL_APPLIED },
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
      is_automatic: false,
      free_shipping: false,
      currency: 'PLN',
    })
    const wrapper = await mountSuspended(CouponField, {
      props: {
        subtotal: 100,
        shippingAmount: 0,
        currency: 'USD',
        modelValue: { ...MANUAL_APPLIED },
      },
    })
    await wrapper.setProps({ currency: 'PLN' })
    await tick()

    expect(mutateAsync).toHaveBeenCalledWith({
      code: 'SAVE10',
      subtotal: 100,
      shipping_amount: 0,
      currency: 'PLN',
    })
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      code: 'SAVE10',
      discountAmount: 42,
      freeShipping: false,
      isAutomatic: false,
    })
  })

  describe('automatic-discount preview', () => {
    it('fires a debounced no-code validate on mount and emits the automatic', async () => {
      mutateAsync.mockResolvedValue({
        code: 'AUTO15',
        discount_type: 'percent',
        discount_amount: 15,
        is_automatic: true,
        free_shipping: false,
        currency: 'USD',
      })
      const wrapper = await mountSuspended(CouponField, {
        props: { subtotal: 100, shippingAmount: 9, currency: 'USD', modelValue: null },
      })
      await waitPreview()

      expect(mutateAsync).toHaveBeenCalledWith({
        code: null,
        subtotal: 100,
        shipping_amount: 9,
        currency: 'USD',
      })
      expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
        code: 'AUTO15',
        discountAmount: 15,
        freeShipping: false,
        isAutomatic: true,
      })
    })

    it('does not emit when nothing applies (null code response)', async () => {
      mutateAsync.mockResolvedValue({ ...NOTHING_APPLIES })
      const wrapper = await mountSuspended(CouponField, {
        props: { subtotal: 100, shippingAmount: 0, currency: 'USD', modelValue: null },
      })
      await waitPreview()

      expect(mutateAsync).toHaveBeenCalled()
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('renders an automatic as a non-dismissible line and keeps the entry form', async () => {
      mutateAsync.mockResolvedValue({ ...NOTHING_APPLIES })
      const wrapper = await mountSuspended(CouponField, {
        props: {
          subtotal: 100,
          shippingAmount: 0,
          currency: 'USD',
          modelValue: { code: 'AUTO15', discountAmount: 15, freeShipping: false, isAutomatic: true },
        },
      })
      const auto = wrapper.find('[data-testid="coupon-automatic"]')
      expect(auto.exists()).toBe(true)
      expect(auto.text()).toContain('Automatic discount')
      expect(auto.text()).toContain('AUTO15')
      // Non-dismissible: no remove button, and the customer can still type a code.
      expect(wrapper.find('[data-testid="coupon-remove"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="coupon-entry"]').exists()).toBe(true)
    })

    it('shows "Free shipping" instead of an amount for a free_shipping automatic', async () => {
      mutateAsync.mockResolvedValue({ ...NOTHING_APPLIES })
      const wrapper = await mountSuspended(CouponField, {
        props: {
          subtotal: 100,
          shippingAmount: 9,
          currency: 'USD',
          modelValue: { code: 'FREESHIP', discountAmount: 9, freeShipping: true, isAutomatic: true },
        },
      })
      const auto = wrapper.find('[data-testid="coupon-automatic"]')
      expect(auto.text()).toContain('Free shipping')
      expect(auto.text()).not.toContain('−')
    })

    it('re-previews on shipping change and emits a free_shipping automatic', async () => {
      mutateAsync.mockResolvedValue({ ...NOTHING_APPLIES })
      const wrapper = await mountSuspended(CouponField, {
        props: { subtotal: 100, shippingAmount: 0, currency: 'USD', modelValue: null },
      })
      await waitPreview()
      mutateAsync.mockResolvedValue({
        code: 'FREESHIP',
        discount_type: 'free_shipping',
        discount_amount: 11,
        is_automatic: true,
        free_shipping: true,
        currency: 'USD',
      })

      await wrapper.setProps({ shippingAmount: 11 })
      await waitPreview()

      expect(mutateAsync).toHaveBeenLastCalledWith({
        code: null,
        subtotal: 100,
        shipping_amount: 11,
        currency: 'USD',
      })
      expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
        code: 'FREESHIP',
        discountAmount: 11,
        freeShipping: true,
        isAutomatic: true,
      })
    })

    it('clears a stale automatic when the preview stops matching', async () => {
      mutateAsync.mockResolvedValue({ ...NOTHING_APPLIES })
      const wrapper = await mountSuspended(CouponField, {
        props: {
          subtotal: 100,
          shippingAmount: 0,
          currency: 'USD',
          modelValue: { code: 'AUTO15', discountAmount: 15, freeShipping: false, isAutomatic: true },
        },
      })
      await wrapper.setProps({ subtotal: 20 })
      await waitPreview()

      expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBeNull()
    })

    it('keeps the automatic on screen when a typed code is rejected', async () => {
      mutateAsync.mockRejectedValue({ data: { detail: 'This coupon has expired.' } })
      const wrapper = await mountSuspended(CouponField, {
        props: {
          subtotal: 100,
          shippingAmount: 0,
          currency: 'USD',
          modelValue: { code: 'AUTO15', discountAmount: 15, freeShipping: false, isAutomatic: true },
        },
      })
      await wrapper.find('input').setValue('OLD')
      await wrapper.find('[data-testid="coupon-entry"]').trigger('submit')
      await tick()

      // Error surfaces, but the automatic line is never clobbered by the 400.
      expect(wrapper.find('[data-testid="coupon-error"]').text()).toContain('expired')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      expect(wrapper.find('[data-testid="coupon-automatic"]').exists()).toBe(true)
    })
  })
})
