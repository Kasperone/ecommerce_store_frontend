// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import OrderRefundDialog from './OrderRefundDialog.vue'
import type { OrderWithUser } from '#shared/types/api'

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    // UModal teleports; happy-dom doesn't render the v-model'd label
    // associations the way a real browser does → false-positive label rule.
    // Same waiver as CategoryFormModal.spec.
    'label': { enabled: false },
  },
}

function makeOrder(overrides: Partial<OrderWithUser> = {}): OrderWithUser {
  return {
    id: 7,
    order_number: 'ORD-20260530-AAA111',
    user_id: 1,
    status: 'paid',
    subtotal: 24.99,
    tax: 0,
    shipping: 0,
    total: 24.99,
    currency: 'USD',
    shipping_address: '1 Test St',
    shipping_city: 'Testville',
    shipping_postal_code: '00-001',
    shipping_country: 'PL',
    payment_method: 'stripe',
    payment_intent_id: 'pi_x',
    notes: null,
    items: [],
    refunds: [],
    user: {
      id: 1,
      email: 'buyer@example.com',
      first_name: 'A',
      last_name: 'B',
    },
    created_at: '2026-05-30T10:00:00Z',
    updated_at: '2026-05-30T10:00:00Z',
    ...overrides,
  } as OrderWithUser
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('AdminOrderRefundDialog', () => {
  it('renders the read-only amount + reason select + note + restock checkbox', async () => {
    await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder(), open: true },
    })
    // The modal teleports; assert on document.body.
    const text = document.body.textContent ?? ''
    expect(text).toContain('Issue refund')
    expect(text).toContain('Refund amount')
    expect(text).toContain('Partial refunds coming in v2')
    expect(text).toContain('Reason')
    expect(text).toContain('Internal note (optional)')
    expect(text).toContain('Restore stock to inventory')
    // The read-only amount shows the total formatted in the order's currency.
    const amount = document.querySelector('[data-testid="refund-amount-readonly"]')
    expect(amount?.textContent).toMatch(/24\.99/)
  })

  // Per status, individual it() blocks so afterEach() actually cleans up
  // between mounts — UModal teleports to document.body, and a single loop's
  // mid-iteration body-innerHTML reset breaks the second mount's teleport
  // target in happy-dom.

  it('defaults restock=true when status=paid (D2 — goods haven\'t shipped)', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ status: 'paid' }), open: true },
    })
    expect((wrapper.vm as any).restock).toBe(true)
  })

  it('defaults restock=true when status=processing (D2 — goods haven\'t shipped)', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ status: 'processing' }), open: true },
    })
    expect((wrapper.vm as any).restock).toBe(true)
  })

  it('defaults restock=false when status=shipped (D2 — admin must verify physical return)', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ status: 'shipped' }), open: true },
    })
    expect((wrapper.vm as any).restock).toBe(false)
  })

  it('defaults restock=false when status=delivered (D2 — admin must verify physical return)', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ status: 'delivered' }), open: true },
    })
    expect((wrapper.vm as any).restock).toBe(false)
  })

  it('emits submit with the order total + selected fields', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ total: 100.0, currency: 'USD' }), open: true },
    })
    // Click the visible "Issue refund" submit button (the modal renders two
    // buttons in the footer — Cancel + Issue refund).
    const submit = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Issue refund' && !b.disabled,
    ) as HTMLButtonElement | undefined
    // The visible "Issue refund" footer button drives the submit emit.
    expect(submit).toBeTruthy()
    submit!.click()
    await new Promise(r => setTimeout(r, 0))
    const emitted = wrapper.emitted('submit') as [unknown[]][]
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toMatchObject({
      amount: 100.0,
      reason: 'customer_request',
      restock: true, // paid status default
      note: null, // empty trim → null
    })
  })

  it('renders an inline ErrorAlert when error is set', async () => {
    await mountSuspended(OrderRefundDialog, {
      props: {
        order: makeOrder(),
        open: true,
        error: {
          status: 400,
          title: 'Bad Request',
          detail: 'Partial refunds are not yet supported.',
        },
      },
    })
    expect(document.body.textContent).toContain('Partial refunds are not yet supported')
  })

  it('is axe-clean', async () => {
    await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder(), open: true },
    })
    const result = await axe(document.body, AXE_OPTIONS)
    expect(result).toHaveNoViolations()
  })
})
