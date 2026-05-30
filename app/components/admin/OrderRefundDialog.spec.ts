// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import OrderRefundDialog from './OrderRefundDialog.vue'
import type { OrderItemResponse, OrderWithUser, RefundResponse } from '#shared/types/api'

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    // UModal teleports; happy-dom doesn't render the v-model'd label
    // associations the way a real browser does → false-positive label rule.
    // Same waiver as CategoryFormModal.spec.
    'label': { enabled: false },
  },
}

function makeLine(overrides: Partial<OrderItemResponse> = {}): OrderItemResponse {
  return {
    id: 11,
    order_id: 7,
    product_id: 100,
    product_name: 'Widget X',
    product_sku: 'WIDGET-X',
    quantity: 2,
    unit_price: 12.5,
    total_price: 25.0,
    created_at: '2026-05-30T10:00:00Z',
    updated_at: '2026-05-30T10:00:00Z',
    ...overrides,
  } as OrderItemResponse
}

function makeOrder(overrides: Partial<OrderWithUser> = {}): OrderWithUser {
  return {
    id: 7,
    order_number: 'ORD-20260530-AAA111',
    user_id: 1,
    status: 'paid',
    subtotal: 25.0,
    tax: 0,
    shipping: 0,
    total: 25.0,
    currency: 'USD',
    shipping_address: '1 Test St',
    shipping_city: 'Testville',
    shipping_postal_code: '00-001',
    shipping_country: 'PL',
    payment_method: 'stripe',
    payment_intent_id: 'pi_x',
    notes: null,
    items: [makeLine()],
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
  it('renders the line picker + editable amount + reason + note + restock', async () => {
    await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder(), open: true },
    })
    const text = document.body.textContent ?? ''
    expect(text).toContain('Issue refund')
    expect(text).toContain('Items to refund')
    expect(text).toContain('Widget X') // line name renders
    expect(text).toContain('Refund amount')
    expect(text).toContain('Reason')
    expect(text).toContain('Internal note (optional)')
    expect(text).toContain('Restore stock to inventory')
    // The v1 "Partial refunds coming in v2" hint copy is gone in v2.
    expect(text).not.toContain('coming in v2')
  })

  it('shows the running total under the amount field', async () => {
    await mountSuspended(OrderRefundDialog, {
      props: {
        order: makeOrder({
          total: 50.0,
          refunds: [{ amount: 10.0, currency: 'USD' } as RefundResponse],
        }),
        open: true,
      },
    })
    const running = document.querySelector('[data-testid="refund-running-total"]')
    // $10 of $50 refunded so far — $40 remaining (per running-total i18n string).
    expect(running?.textContent).toMatch(/10/)
    expect(running?.textContent).toMatch(/50/)
    expect(running?.textContent).toMatch(/40/)
  })

  it('auto-fills the amount from the picker subtotal', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ total: 25.0 }), open: true },
    })
    // Pick 2 units of the line at $12.50 → amount = $25.00.
    ;(wrapper.vm as any).pickedQty[11] = 2
    await new Promise(r => setTimeout(r, 0))
    expect((wrapper.vm as any).amount).toBeCloseTo(25.0)
  })

  it('lets the admin override the amount on top of the picker (goodwill credit)', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ total: 50.0 }), open: true },
    })
    ;(wrapper.vm as any).pickedQty[11] = 1
    await new Promise(r => setTimeout(r, 0))
    expect((wrapper.vm as any).amount).toBeCloseTo(12.5)
    // Admin bumps up: amount becomes a sticky goodwill total.
    ;(wrapper.vm as any).amount = 20.0
    ;(wrapper.vm as any).onAmountInput()
    // Picker change should NOT clobber the manual amount now.
    ;(wrapper.vm as any).pickedQty[11] = 2
    await new Promise(r => setTimeout(r, 0))
    expect((wrapper.vm as any).amount).toBeCloseTo(20.0)
  })

  it('disables restock when no items are picked (D5 mirror)', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ status: 'paid' }), open: true },
    })
    // Default-on under paid, but no picks yet → restock forced off + checkbox disabled.
    expect((wrapper.vm as any).restockDisabled).toBe(true)
    // Pick a unit → restock can be toggled back on.
    ;(wrapper.vm as any).pickedQty[11] = 1
    await new Promise(r => setTimeout(r, 0))
    expect((wrapper.vm as any).restockDisabled).toBe(false)
  })

  it('emits submit with items payload when picker has entries', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ total: 25.0 }), open: true },
    })
    ;(wrapper.vm as any).pickedQty[11] = 2
    await new Promise(r => setTimeout(r, 0))
    ;(wrapper.vm as any).restock = true
    const submit = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Issue refund' && !b.disabled,
    ) as HTMLButtonElement | undefined
    expect(submit).toBeTruthy()
    submit!.click()
    await new Promise(r => setTimeout(r, 0))
    const emitted = wrapper.emitted('submit') as [unknown[]][]
    expect(emitted![0]![0]).toMatchObject({
      amount: 25.0,
      reason: 'customer_request',
      restock: true,
      note: null,
      items: [{ order_item_id: 11, quantity: 2 }],
    })
  })

  it('forces restock=false in the submit payload even when the ref is true with no items picked', async () => {
    // Regression for the live-verify bug: the open-flip's reset to D2 default
    // (`restock=true` under status=paid) doesn't re-fire the `restockDisabled`
    // watcher because the empty-picker truth didn't change. The dialog rendered
    // the checkbox as disabled but submit still carried `restock=true` → BE D5
    // 400. Fix: belt-and-suspenders force-off in `onSubmit` when items is null.
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ status: 'paid', total: 25.0 }), open: true },
    })
    // Force the ref to true to simulate the open-flip race; the submit handler
    // must still send false because items is null.
    ;(wrapper.vm as any).restock = true
    ;(wrapper.vm as any).amount = 5.0
    ;(wrapper.vm as any).amountOverridden = true
    await new Promise(r => setTimeout(r, 0))
    const submit = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Issue refund' && !b.disabled,
    ) as HTMLButtonElement | undefined
    submit!.click()
    await new Promise(r => setTimeout(r, 0))
    const emitted = wrapper.emitted('submit') as [unknown[]][]
    expect(emitted![0]![0]).toMatchObject({
      amount: 5.0,
      items: null,
      restock: false,
    })
  })

  it('emits items=null for a goodwill refund (free-form amount, no picks)', async () => {
    const wrapper = await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder({ total: 25.0 }), open: true },
    })
    // No picker entries; admin types $5 in the amount field.
    ;(wrapper.vm as any).amount = 5.0
    ;(wrapper.vm as any).onAmountInput()
    await new Promise(r => setTimeout(r, 0))
    const submit = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Issue refund' && !b.disabled,
    ) as HTMLButtonElement | undefined
    submit!.click()
    await new Promise(r => setTimeout(r, 0))
    const emitted = wrapper.emitted('submit') as [unknown[]][]
    expect(emitted![0]![0]).toMatchObject({
      amount: 5.0,
      items: null,
      restock: false, // forced off when no items picked
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
          detail: 'Refund amount would exceed the order total.',
        },
      },
    })
    expect(document.body.textContent).toContain('exceed the order total')
  })

  it('is axe-clean', async () => {
    await mountSuspended(OrderRefundDialog, {
      props: { order: makeOrder(), open: true },
    })
    const result = await axe(document.body, AXE_OPTIONS)
    expect(result).toHaveNoViolations()
  })
})
