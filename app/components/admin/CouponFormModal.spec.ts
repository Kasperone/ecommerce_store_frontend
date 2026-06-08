// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import { ref } from 'vue'
import CouponFormModal from './CouponFormModal.vue'

/**
 * The modal owns the create/update mutations + the success toast and the
 * client-side validation that mirrors the backend rules. We stub the
 * auto-imported mutations/toast and assert: create-vs-edit title + prefill, the
 * create/update payloads (code uppercased, percent ⇒ currency null), each
 * validation guard (value range, currency-required-for-fixed, ends>starts),
 * error rendering, and a11y. URL/verb mapping is pinned in the query spec.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'label': { enabled: false },
    // USwitch renders button[role=switch] wrapping a visually-hidden input —
    // axe flags it as nested-interactive (library artifact). Same as warehouses.
    'nested-interactive': { enabled: false },
  },
}

const { createMutate, updateMutate, toastAdd } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  toastAdd: vi.fn(),
}))

mockNuxtImport('useCreateCoupon', () => () => ({
  mutateAsync: createMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useUpdateCoupon', () => () => ({
  mutateAsync: updateMutate,
  isLoading: ref(false),
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

beforeEach(() => {
  createMutate.mockReset().mockResolvedValue({})
  updateMutate.mockReset().mockResolvedValue({})
  toastAdd.mockReset()
  document.body.innerHTML = ''
})

function clickSave() {
  const saveBtn = [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Save',
  ) as HTMLButtonElement | undefined
  saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

const tick = () => new Promise(r => setTimeout(r, 0))

const existing = {
  id: 7,
  code: 'WINTER',
  description: 'Winter sale',
  discount_type: 'fixed' as const,
  value: 25,
  currency: 'EUR' as const,
  min_order_amount: 100,
  max_uses: 50,
  used_count: 3,
  starts_at: null,
  ends_at: null,
  is_automatic: false,
  is_active: true,
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

describe('CouponFormModal', () => {
  it('shows the create title when no coupon is passed', async () => {
    await mountSuspended(CouponFormModal, { props: { open: true, coupon: null } })
    expect(document.body.textContent).toContain('New coupon')
  })

  it('prefills and shows the edit title when a coupon is passed', async () => {
    await mountSuspended(CouponFormModal, { props: { open: true, coupon: existing } })
    expect(document.body.textContent).toContain('Edit coupon')
    const values = [...document.querySelectorAll('input')].map(i => i.value)
    expect(values).toContain('WINTER')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CouponFormModal, { props: { open: true, coupon: null } })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('creates a percent coupon (code uppercased, currency null) on save', async () => {
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: null },
    })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    // [0] = code, [1] = starts_at, [2] = ends_at (description is a UTextarea).
    inputs[0]!.vm.$emit('update:modelValue', 'summer10')
    const numbers = wrapper.findAllComponents({ name: 'UInputNumber' })
    numbers[0]!.vm.$emit('update:modelValue', 10) // value
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const body = createMutate.mock.calls[0]![0]
    expect(body).toMatchObject({
      code: 'SUMMER10',
      discount_type: 'percent',
      value: 10,
      currency: null,
    })
    expect(toastAdd).toHaveBeenCalled()
  })

  it('submits per_user_limit alongside max_uses (flexible coupon)', async () => {
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'FLEX')
    const numbers = wrapper.findAllComponents({ name: 'UInputNumber' })
    numbers[0]!.vm.$emit('update:modelValue', 10) // value
    numbers[2]!.vm.$emit('update:modelValue', 1000) // max_uses
    numbers[3]!.vm.$emit('update:modelValue', 2) // per_user_limit
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0]![0]).toMatchObject({
      max_uses: 1000,
      per_user_limit: 2,
    })
  })

  it('rejects a percent value outside 1–100 without calling the mutation', async () => {
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'BIG')
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 150)
    await tick()

    clickSave()
    await tick()

    // Client-side Zod validation blocks submit and renders the field error.
    expect(createMutate).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Percentage must be between 1 and 100.')
  })

  it('requires a currency for a fixed-amount coupon', async () => {
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'FIX')
    // Switch type to fixed.
    wrapper.findAllComponents({ name: 'USelect' })[0]!.vm.$emit('update:modelValue', 'fixed')
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 20)
    await tick()

    clickSave()
    await tick()

    expect(createMutate).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Currency is required for a fixed-amount discount.')
  })

  it('updates an existing coupon on save (PATCH payload)', async () => {
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: existing },
    })
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 30)
    await tick()

    clickSave()
    await tick()

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const { id, patch } = updateMutate.mock.calls[0]![0]
    expect(id).toBe(7)
    expect(patch).toMatchObject({ code: 'WINTER', discount_type: 'fixed', value: 30, currency: 'EUR' })
  })

  it('creates a free_shipping coupon with value 0 + currency null and hides both inputs', async () => {
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'freeship')
    wrapper.findAllComponents({ name: 'USelect' })[0]!.vm.$emit('update:modelValue', 'free_shipping')
    await tick()

    // Value + currency inputs are hidden for free_shipping: the first
    // UInputNumber is now min_order_amount and no currency select renders.
    expect(document.body.textContent).not.toContain('Value')
    expect(wrapper.findAllComponents({ name: 'USelect' }).length).toBe(1)

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0]![0]).toMatchObject({
      code: 'FREESHIP',
      discount_type: 'free_shipping',
      value: 0,
      currency: null,
    })
  })

  it('submits is_automatic when the toggle is flipped on', async () => {
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'AUTO10')
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 10)
    // [0] = is_automatic, [1] = is_active.
    wrapper.findAllComponents({ name: 'USwitch' })[0]!.vm.$emit('update:modelValue', true)
    await tick()

    clickSave()
    await tick()

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0]![0]).toMatchObject({
      code: 'AUTO10',
      is_automatic: true,
      is_active: true,
    })
  })

  it('defaults is_automatic to false on create', async () => {
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'PLAIN')
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 10)
    await tick()

    clickSave()
    await tick()

    expect(createMutate.mock.calls[0]![0]).toMatchObject({ is_automatic: false })
  })

  it('flips an existing fixed coupon to free_shipping with value 0 + currency null in the same PATCH', async () => {
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: existing },
    })
    wrapper.findAllComponents({ name: 'USelect' })[0]!.vm.$emit('update:modelValue', 'free_shipping')
    await tick()

    clickSave()
    await tick()

    // The backend 422s a discount_type flip unless value 0 + currency null ride
    // along in the SAME patch — pin all three together.
    expect(updateMutate).toHaveBeenCalledTimes(1)
    const { id, patch } = updateMutate.mock.calls[0]![0]
    expect(id).toBe(7)
    expect(patch).toMatchObject({
      discount_type: 'free_shipping',
      value: 0,
      currency: null,
    })
  })

  it('shows the inline error alert + an error toast when the mutation fails (e.g. duplicate code)', async () => {
    createMutate.mockRejectedValue({ data: { detail: 'Coupon code already exists' } })
    const wrapper = await mountSuspended(CouponFormModal, {
      props: { open: true, coupon: null },
    })
    wrapper.findAllComponents({ name: 'UInput' })[0]!.vm.$emit('update:modelValue', 'DUP')
    wrapper.findAllComponents({ name: 'UInputNumber' })[0]!.vm.$emit('update:modelValue', 10)
    await tick()

    clickSave()
    await tick()

    // Gold-standard flow: server detail surfaces inline (role=alert) + as a toast.
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Coupon code already exists')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })
})
