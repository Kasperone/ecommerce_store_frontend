// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ShippingZoneFormDialog from './ShippingZoneFormDialog.vue'

/**
 * UModal teleports its content out of the component's DOM subtree, so
 * `wrapper.text()` doesn't see the modal body. Assertions read from
 * `document.body.textContent`, same as `CategoryFormModal.spec.ts`.
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

mockNuxtImport('useCreateShippingZone', () => () => ({
  mutateAsync: vi.fn(),
  isLoading: { value: false },
}))
mockNuxtImport('useUpdateShippingZone', () => () => ({
  mutateAsync: vi.fn(),
  isLoading: { value: false },
}))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

describe('AdminShippingZoneFormDialog', () => {
  it('renders create mode header when no zone is provided', async () => {
    await mountSuspended(ShippingZoneFormDialog, { props: { open: true, zone: null } })
    expect(document.body.textContent).toContain('New shipping zone')
  })

  it('renders edit mode header when a zone is provided', async () => {
    const zone = {
      id: 1, name: 'Poland Zone', country_count: 1, rate_count: 0, sort_order: 0,
      is_active: true, description: null,
      created_at: '2026-05-30T00:00:00Z', updated_at: '2026-05-30T00:00:00Z',
    }
    await mountSuspended(ShippingZoneFormDialog, {
      props: { open: true, zone, initialCountryCodes: ['PL'] },
    })
    expect(document.body.textContent).toContain('Edit shipping zone')
  })

  it('is axe-clean', async () => {
    await mountSuspended(ShippingZoneFormDialog, { props: { open: true, zone: null } })
    const results = await axe(document.body, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
