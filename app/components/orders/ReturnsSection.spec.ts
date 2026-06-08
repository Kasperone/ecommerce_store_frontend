// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ReturnsSection from './ReturnsSection.vue'
import type { ReturnItemResponse, ReturnRequestResponse } from '#shared/types/api'

function makeItem(overrides: Partial<ReturnItemResponse> = {}): ReturnItemResponse {
  return {
    id: 91,
    return_request_id: 1,
    order_item_id: 11,
    quantity: 1,
    reason: 'defective',
    product_name: 'Widget X',
    variant_title: null,
    unit_price: 12.5,
    line_subtotal: 12.5,
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    ...overrides,
  }
}

function makeReturn(overrides: Partial<ReturnRequestResponse> = {}): ReturnRequestResponse {
  return {
    id: 1,
    order_id: 7,
    user_id: 42,
    status: 'requested',
    comment: 'Arrived cracked',
    admin_note: 'INTERNAL ADMIN NOTE — must not leak to customer',
    refund_id: null,
    resolved_at: null,
    order_number: 'ORD-20260601-AAA111',
    currency: 'USD',
    customer_email: 'buyer@example.com',
    items: [makeItem()],
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    ...overrides,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('OrdersReturnsSection (customer view)', () => {
  it('renders nothing when there are no returns', async () => {
    const wrapper = await mountSuspended(ReturnsSection, {
      props: { returns: [] },
    })
    expect(wrapper.find('[data-testid="customer-returns"]').exists()).toBe(false)
  })

  it('renders the section with the status badge', async () => {
    const wrapper = await mountSuspended(ReturnsSection, {
      props: { returns: [makeReturn()] },
    })
    const text = wrapper.text()
    expect(text).toContain('Returns')
    expect(text).toContain('Requested')
  })

  it('renders the per-item breakdown with name + qty + customer-friendly reason', async () => {
    const wrapper = await mountSuspended(ReturnsSection, {
      props: {
        returns: [makeReturn({
          items: [makeItem({ product_name: 'Widget X', quantity: 2, reason: 'wrong_item' })],
        })],
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Widget X')
    expect(text).toContain('2')
    expect(text).toContain('Wrong item received')
  })

  it('renders the customer comment', async () => {
    const wrapper = await mountSuspended(ReturnsSection, {
      props: { returns: [makeReturn({ comment: 'Arrived cracked' })] },
    })
    expect(wrapper.text()).toContain('Arrived cracked')
  })

  it('NEVER leaks the admin internal note to the customer', async () => {
    const wrapper = await mountSuspended(ReturnsSection, {
      props: { returns: [makeReturn()] },
    })
    expect(wrapper.text()).not.toContain('INTERNAL ADMIN NOTE')
  })

  it('translates every status to a badge label', async () => {
    const wrapper = await mountSuspended(ReturnsSection, {
      props: {
        returns: [
          makeReturn({ id: 1, status: 'rejected' }),
          makeReturn({ id: 2, status: 'refunded' }),
        ],
      },
    })
    const text = wrapper.text()
    expect(text).toContain('Rejected')
    expect(text).toContain('Refunded')
  })

  it('is axe-clean', async () => {
    await mountSuspended(ReturnsSection, {
      props: { returns: [makeReturn()] },
    })
    const result = await axe(document.body)
    expect(result).toHaveNoViolations()
  })
})
