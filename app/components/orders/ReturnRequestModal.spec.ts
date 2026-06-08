// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ReturnRequestModal from './ReturnRequestModal.vue'
import type { ReturnEligibilityResponse } from '#shared/types/api'

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    // UModal teleports; happy-dom doesn't render the v-model'd label
    // associations the way a real browser does → false-positive label rule.
    'label': { enabled: false },
    // UInputNumber renders a button-wrapped visually-hidden input → axe flags
    // nested-interactive; library rendering artifact, same posture as elsewhere.
    'nested-interactive': { enabled: false },
  },
}

function makeEligibility(
  overrides: Partial<ReturnEligibilityResponse> = {},
): ReturnEligibilityResponse {
  return {
    eligible: true,
    reason: null,
    window_ends_at: '2026-07-01T00:00:00Z',
    lines: [
      {
        order_item_id: 11,
        product_name: 'Widget X',
        variant_title: 'Red / L',
        quantity: 3,
        returnable_qty: 2,
      },
      {
        order_item_id: 12,
        product_name: 'Gadget Y',
        variant_title: null,
        quantity: 1,
        returnable_qty: 0, // fully returned already — must not render
      },
    ],
    ...overrides,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('OrdersReturnRequestModal', () => {
  it('renders only lines with returnable qty + the comment field + policy link', async () => {
    await mountSuspended(ReturnRequestModal, {
      props: { eligibility: makeEligibility(), open: true },
    })
    const text = document.body.textContent ?? ''
    expect(text).toContain('Request a return')
    expect(text).toContain('Widget X')
    expect(text).toContain('Red / L')
    // Zero-returnable line is filtered out.
    expect(text).not.toContain('Gadget Y')
    expect(text).toContain('Comment (optional)')
    const policy = document.querySelector('[data-testid="return-policy-link"]')
    expect(policy).toBeTruthy()
    expect(policy?.getAttribute('href')).toBe('/returns')
  })

  it('caps the qty stepper at the line returnable_qty', async () => {
    await mountSuspended(ReturnRequestModal, {
      props: { eligibility: makeEligibility(), open: true },
    })
    // UInputNumber inherits attrs onto its <input>, which carries
    // aria-valuemax bound to :max.
    const qtyInput = document.querySelector(
      '[data-testid="return-line-11-qty"]',
    ) as HTMLInputElement | null
    expect(qtyInput).toBeTruthy()
    expect(qtyInput!.getAttribute('aria-valuemax')).toBe('2')
  })

  it('disables submit until at least one item is picked', async () => {
    const wrapper = await mountSuspended(ReturnRequestModal, {
      props: { eligibility: makeEligibility(), open: true },
    })
    const submit = document.querySelector(
      '[data-testid="return-submit"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    ;(wrapper.vm as any).pickedQty[11] = 1
    await new Promise(r => setTimeout(r, 0))
    expect(submit.disabled).toBe(false)
  })

  it('requires a reason for every picked line (no emit without one)', async () => {
    const wrapper = await mountSuspended(ReturnRequestModal, {
      props: { eligibility: makeEligibility(), open: true },
    })
    ;(wrapper.vm as any).pickedQty[11] = 1
    await new Promise(r => setTimeout(r, 0))
    const submit = document.querySelector(
      '[data-testid="return-submit"]',
    ) as HTMLButtonElement
    submit.click()
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('submit')).toBeFalsy()
    // Inline alert explains the missing reason.
    expect(document.body.textContent).toContain(
      'Select a reason for every item',
    )
  })

  it('emits the ReturnRequestCreate payload when qty + reason are picked', async () => {
    const wrapper = await mountSuspended(ReturnRequestModal, {
      props: { eligibility: makeEligibility(), open: true },
    })
    ;(wrapper.vm as any).pickedQty[11] = 2
    ;(wrapper.vm as any).pickedReason[11] = 'defective'
    ;(wrapper.vm as any).comment = '  Cracked on arrival  '
    await new Promise(r => setTimeout(r, 0))
    const submit = document.querySelector(
      '[data-testid="return-submit"]',
    ) as HTMLButtonElement
    submit.click()
    await new Promise(r => setTimeout(r, 0))
    const emitted = wrapper.emitted('submit') as [unknown[]][]
    expect(emitted).toBeTruthy()
    expect(emitted[0]![0]).toMatchObject({
      items: [{ order_item_id: 11, quantity: 2, reason: 'defective' }],
      comment: 'Cracked on arrival',
    })
  })

  it('sends comment=null when the comment is blank', async () => {
    const wrapper = await mountSuspended(ReturnRequestModal, {
      props: { eligibility: makeEligibility(), open: true },
    })
    ;(wrapper.vm as any).pickedQty[11] = 1
    ;(wrapper.vm as any).pickedReason[11] = 'other'
    await new Promise(r => setTimeout(r, 0))
    ;(document.querySelector('[data-testid="return-submit"]') as HTMLButtonElement).click()
    await new Promise(r => setTimeout(r, 0))
    const emitted = wrapper.emitted('submit') as [unknown[]][]
    expect(emitted[0]![0]).toMatchObject({ comment: null })
  })

  it('surfaces the server error inline when a raw error is passed', async () => {
    const wrapper = await mountSuspended(ReturnRequestModal, {
      props: { eligibility: makeEligibility(), open: true, error: null },
    })
    await wrapper.setProps({
      error: { data: { detail: 'Return window closed.' } },
    })
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('Return window closed.')
  })

  it('is axe-clean', async () => {
    await mountSuspended(ReturnRequestModal, {
      props: { eligibility: makeEligibility(), open: true },
    })
    const result = await axe(document.body, AXE_OPTIONS)
    expect(result).toHaveNoViolations()
  })
})
