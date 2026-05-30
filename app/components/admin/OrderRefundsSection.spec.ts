// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import OrderRefundsSection from './OrderRefundsSection.vue'
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
    note: null,
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

describe('AdminOrderRefundsSection', () => {
  it('renders the empty-state copy when no refunds are issued', async () => {
    const wrapper = await mountSuspended(OrderRefundsSection, {
      props: { refunds: [], currency: 'USD' },
    })
    expect(wrapper.text()).toContain('No refunds issued.')
  })

  it('renders each refund row with reason badge + actor email + date', async () => {
    const wrapper = await mountSuspended(OrderRefundsSection, {
      props: { refunds: [makeRefund()], currency: 'USD' },
    })
    const text = wrapper.text()
    expect(text).toContain('Customer request')
    expect(text).toContain('admin@example.com')
    // The amount is formatted in the order's currency.
    expect(text).toMatch(/24\.99/)
  })

  it('shows the admin-only note when present', async () => {
    const wrapper = await mountSuspended(OrderRefundsSection, {
      props: {
        refunds: [makeRefund({ note: 'Internal: customer was upset' })],
        currency: 'USD',
      },
    })
    expect(wrapper.find('[data-testid="refund-note-admin"]').text()).toBe(
      'Internal: customer was upset',
    )
  })

  it('shows the Restocked badge when restock=true', async () => {
    const wrapper = await mountSuspended(OrderRefundsSection, {
      props: { refunds: [makeRefund({ restock: true })], currency: 'USD' },
    })
    expect(wrapper.text()).toContain('Restocked')
  })

  it('shows the KOR reference when a corrective invoice was issued', async () => {
    const wrapper = await mountSuspended(OrderRefundsSection, {
      props: {
        refunds: [
          makeRefund({
            corrective_invoice: {
              id: 1,
              kor_number: 'KOR/2026/00007',
              year: 2026,
              seq: 7,
              issued_at: '2026-05-30T10:00:00',
              original_invoice_id: 12,
              created_at: '2026-05-30T10:00:00',
              updated_at: '2026-05-30T10:00:00',
            },
          }),
        ],
        currency: 'USD',
      },
    })
    expect(wrapper.text()).toContain('KOR/2026/00007')
  })

  it('renders the per-item breakdown when refund.items is non-empty', async () => {
    const wrapper = await mountSuspended(OrderRefundsSection, {
      props: {
        refunds: [makeRefund({ items: [makeItem({ product_name: 'Widget X', quantity: 2 })] })],
        currency: 'USD',
      },
    })
    const breakdown = wrapper.find('[data-testid="refund-1-items"]')
    expect(breakdown.exists()).toBe(true)
    expect(breakdown.text()).toContain('Widget X')
    expect(breakdown.text()).toContain('2')
  })

  it('omits the per-item breakdown for goodwill refunds (items=[])', async () => {
    const wrapper = await mountSuspended(OrderRefundsSection, {
      props: { refunds: [makeRefund({ items: [] })], currency: 'USD' },
    })
    expect(wrapper.find('[data-testid="refund-1-items"]').exists()).toBe(false)
  })

  it('falls back to a placeholder label when the issuing admin was removed', async () => {
    const wrapper = await mountSuspended(OrderRefundsSection, {
      props: {
        refunds: [makeRefund({ actor_user_id: null, actor_email: null })],
        currency: 'USD',
      },
    })
    expect(wrapper.text()).toContain('Removed admin')
  })

  it('is axe-clean', async () => {
    await mountSuspended(OrderRefundsSection, {
      props: { refunds: [makeRefund(), makeRefund({ id: 2, restock: true })], currency: 'USD' },
    })
    const result = await axe(document.body)
    expect(result).toHaveNoViolations()
  })
})
