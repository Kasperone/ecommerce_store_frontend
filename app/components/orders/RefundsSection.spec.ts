// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import RefundsSection from './RefundsSection.vue'
import type { RefundResponse } from '#shared/types/api'

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

  it('is axe-clean', async () => {
    await mountSuspended(RefundsSection, {
      props: { refunds: [makeRefund()], currency: 'USD' },
    })
    const result = await axe(document.body)
    expect(result).toHaveNoViolations()
  })
})
