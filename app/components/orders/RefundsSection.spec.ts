// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import RefundsSection from './RefundsSection.vue'
import type { RefundItemResponse, RefundResponse } from '#shared/types/api'

function makeItem(overrides: Partial<RefundItemResponse> = {}): RefundItemResponse {
  return {
    id: 91,
    refund_id: 1,
    order_item_id: 11,
    quantity: 1,
    product_name: 'Widget X',
    unit_price: 12.5,
    line_subtotal: 12.5,
    created_at: '2026-05-30T10:00:00Z',
    updated_at: '2026-05-30T10:00:00Z',
    ...overrides,
  } as RefundItemResponse
}

function makeRefund(overrides: Partial<RefundResponse> = {}): RefundResponse {
  return {
    id: 1,
    order_id: 7,
    amount: 24.99,
    currency: 'USD',
    reason: 'customer_request',
    note: 'INTERNAL ADMIN NOTE — must not leak to customer',
    restock: false,
    provider_refund_id: null,
    actor_user_id: 42,
    actor_email: 'admin@example.com',
    corrective_invoice: null,
    items: [],
    created_at: '2026-05-30T10:00:00Z',
    updated_at: '2026-05-30T10:00:00Z',
    ...overrides,
  } as RefundResponse
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('OrdersRefundsSection (customer view)', () => {
  it('renders nothing when there are no refunds', async () => {
    const wrapper = await mountSuspended(RefundsSection, {
      props: { refunds: [], currency: 'USD' },
    })
    // No customer-refunds section rendered when the array is empty.
    expect(wrapper.find('[data-testid="customer-refunds"]').exists()).toBe(false)
  })

  it('renders the refunds banner + customer-friendly reason translation', async () => {
    const wrapper = await mountSuspended(RefundsSection, {
      props: { refunds: [makeRefund()], currency: 'USD' },
    })
    const text = wrapper.text()
    // Title + intro copy is present.
    expect(text).toContain('Refund issued')
    // Customer-facing translation, not the admin enum label.
    expect(text).toContain('Per your request')
    expect(text).not.toContain('Customer request')
  })

  it('NEVER leaks the admin internal note to the customer', async () => {
    const wrapper = await mountSuspended(RefundsSection, {
      props: { refunds: [makeRefund()], currency: 'USD' },
    })
    // The internal note is explicitly excluded from the customer-facing UI.
    expect(wrapper.text()).not.toContain('INTERNAL ADMIN NOTE')
  })

  it('NEVER leaks the issuing admin email to the customer', async () => {
    const wrapper = await mountSuspended(RefundsSection, {
      props: { refunds: [makeRefund()], currency: 'USD' },
    })
    expect(wrapper.text()).not.toContain('admin@example.com')
  })

  it('renders each refund with its amount + currency', async () => {
    const wrapper = await mountSuspended(RefundsSection, {
      props: {
        refunds: [makeRefund({ amount: 13.5, currency: 'USD' })],
        currency: 'USD',
      },
    })
    expect(wrapper.text()).toMatch(/13\.5/)
  })

  it('renders the per-item breakdown with product_name + qty', async () => {
    const wrapper = await mountSuspended(RefundsSection, {
      props: {
        refunds: [makeRefund({ items: [makeItem({ product_name: 'Widget X', quantity: 2 })] })],
        currency: 'USD',
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Widget X')
    expect(text).toContain('2') // quantity surfaces
  })

  it('NEVER leaks unit_price or line_subtotal to the customer (privacy)', async () => {
    const wrapper = await mountSuspended(RefundsSection, {
      props: {
        refunds: [
          makeRefund({
            items: [makeItem({
              product_name: 'Widget X',
              quantity: 2,
              unit_price: 99.987654, // sentinel value — must not surface
              line_subtotal: 199.987654, // sentinel value — must not surface
            })],
          }),
        ],
        currency: 'USD',
      },
    })
    expect(wrapper.text()).not.toContain('99.987654')
    expect(wrapper.text()).not.toContain('199.987654')
  })

  it('renders the partial-refund banner copy when order status is partially_refunded', async () => {
    const wrapper = await mountSuspended(RefundsSection, {
      props: {
        refunds: [makeRefund({ amount: 10 })],
        currency: 'USD',
        status: 'partially_refunded',
        orderTotal: 50,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Partial refund issued')
    // Summary line shows "$10 of $50 refunded".
    const summary = wrapper.find('[data-testid="customer-refund-summary"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toMatch(/10/)
    expect(summary.text()).toMatch(/50/)
  })

  it('falls back to the full-refund copy when status is refunded', async () => {
    const wrapper = await mountSuspended(RefundsSection, {
      props: {
        refunds: [makeRefund()],
        currency: 'USD',
        status: 'refunded',
        orderTotal: 24.99,
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Refund issued')
    expect(text).not.toContain('Partial refund issued')
    expect(wrapper.find('[data-testid="customer-refund-summary"]').exists()).toBe(false)
  })

  it('is axe-clean', async () => {
    await mountSuspended(RefundsSection, {
      props: { refunds: [makeRefund()], currency: 'USD' },
    })
    const result = await axe(document.body)
    expect(result).toHaveNoViolations()
  })
})
