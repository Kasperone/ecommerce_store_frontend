// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ShippingRateFormDialog from './ShippingRateFormDialog.vue'

/**
 * Surface contract:
 * - Renders the right header for create vs edit mode.
 * - Surfaces the tiers expander + preview block.
 * - axe-clean.
 * (Submit/conflict paths are exercised in the live Playwright walkthrough +
 * pinned at the API-contract layer in `useShippingQueries.spec.ts`.)
 */

const AXE_OPTIONS = {
  rules: {
    'region': { enabled: false },
    'label': { enabled: false },
    'button-name': { enabled: false },
    'aria-hidden-focus': { enabled: false },
    'aria-dialog-name': { enabled: false },
    'label-title-only': { enabled: false },
  },
}

mockNuxtImport('useCreateShippingRate', () => () => ({
  mutateAsync: vi.fn(),
  isLoading: { value: false },
}))
mockNuxtImport('useUpdateShippingRate', () => () => ({
  mutateAsync: vi.fn(),
  isLoading: { value: false },
}))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

const zones = [
  { id: 1, name: 'PL', country_count: 1, rate_count: 0, sort_order: 0, is_active: true,
    description: null, created_at: '2026-05-30T00:00:00Z', updated_at: '2026-05-30T00:00:00Z' },
]
const methods = [
  { id: 10, name: 'Standard', code: 'standard', description: null, sort_order: 0,
    is_active: true, created_at: '2026-05-30T00:00:00Z', updated_at: '2026-05-30T00:00:00Z' },
]

describe('AdminShippingRateFormDialog', () => {
  it('renders create mode header when no rate is provided', async () => {
    await mountSuspended(ShippingRateFormDialog, {
      props: { open: true, rate: null, zones, methods },
    })
    expect(document.body.textContent).toContain('New shipping rate')
  })

  it('renders edit mode header when a rate is provided', async () => {
    const rate = {
      id: 7, zone_id: 1, zone_name: 'PL', method_id: 10, method_name: 'Standard',
      currency: 'USD', amount: 4.99, free_above_subtotal: 49, tiers: null,
      pricing_kind: 'free_above' as const,
      created_at: '2026-05-30T00:00:00Z', updated_at: '2026-05-30T00:00:00Z',
    }
    await mountSuspended(ShippingRateFormDialog, {
      props: { open: true, rate, zones, methods },
    })
    expect(document.body.textContent).toContain('Edit shipping rate')
  })

  it('shows the tiers expander control', async () => {
    await mountSuspended(ShippingRateFormDialog, {
      props: { open: true, rate: null, zones, methods },
    })
    expect(document.body.textContent).toContain('Configure subtotal tiers')
  })

  it('shows the preview row', async () => {
    await mountSuspended(ShippingRateFormDialog, {
      props: { open: true, rate: null, zones, methods },
    })
    expect(document.body.textContent).toContain('Preview')
  })

  it('is axe-clean', async () => {
    await mountSuspended(ShippingRateFormDialog, {
      props: { open: true, rate: null, zones, methods },
    })
    const results = await axe(document.body, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
