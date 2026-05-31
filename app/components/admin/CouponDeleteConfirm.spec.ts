// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { CouponResponse } from '~/composables/queries/useCouponQueries'
import CouponDeleteConfirm from './CouponDeleteConfirm.vue'

/**
 * Stateless, parent-driven confirm. We assert it renders the coupon code in the
 * prompt, emits `confirm` with the id on Delete, disables the button while
 * loading, surfaces a passed-in error, and is axe-clean.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

function makeCoupon(over: Partial<CouponResponse> = {}): CouponResponse {
  return {
    id: 7,
    code: 'WINTER',
    description: null,
    discount_type: 'percent',
    value: 10,
    currency: null,
    min_order_amount: null,
    max_uses: null,
    used_count: 0,
    starts_at: null,
    ends_at: null,
    is_active: true,
    created_at: '2026-05-28T00:00:00Z',
    updated_at: '2026-05-28T00:00:00Z',
    ...over,
  }
}

function deleteButton(): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Delete',
  ) as HTMLButtonElement
}

// Each test renders a UModal into document.body — clean up between tests.
afterEach(() => {
  document.body.innerHTML = ''
})

describe('CouponDeleteConfirm', () => {
  it('renders the coupon code in the confirmation prompt', async () => {
    await mountSuspended(CouponDeleteConfirm, {
      props: { open: true, coupon: makeCoupon({ code: 'SUMMER10' }) },
    })
    expect(document.body.textContent).toContain('SUMMER10')
  })

  it('emits confirm with the coupon id on Delete', async () => {
    const wrapper = await mountSuspended(CouponDeleteConfirm, {
      props: { open: true, coupon: makeCoupon({ id: 42 }) },
    })
    deleteButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toBe(42)
  })

  it('does not emit confirm while loading', async () => {
    const wrapper = await mountSuspended(CouponDeleteConfirm, {
      props: { open: true, coupon: makeCoupon(), loading: true },
    })
    const btn = deleteButton()
    expect(btn.disabled).toBe(true)
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('surfaces a passed-in error', async () => {
    await mountSuspended(CouponDeleteConfirm, {
      props: {
        open: true,
        coupon: makeCoupon(),
        error: { title: 'Coupon is in use' },
      },
    })
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Coupon is in use')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CouponDeleteConfirm, {
      props: { open: true, coupon: makeCoupon() },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
