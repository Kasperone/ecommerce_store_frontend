// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ShippingMethodFormDialog from './ShippingMethodFormDialog.vue'

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

mockNuxtImport('useCreateShippingMethod', () => () => ({
  mutateAsync: vi.fn(),
  isLoading: { value: false },
}))
mockNuxtImport('useUpdateShippingMethod', () => () => ({
  mutateAsync: vi.fn(),
  isLoading: { value: false },
}))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

describe('AdminShippingMethodFormDialog', () => {
  it('renders create mode header when no method is provided', async () => {
    await mountSuspended(ShippingMethodFormDialog, { props: { open: true, method: null } })
    expect(document.body.textContent).toContain('New shipping method')
  })

  it('renders edit mode header when a method is provided', async () => {
    const method = {
      id: 1, name: 'Standard', code: 'standard', description: null, sort_order: 0,
      is_active: true,
      created_at: '2026-05-30T00:00:00Z', updated_at: '2026-05-30T00:00:00Z',
    }
    await mountSuspended(ShippingMethodFormDialog, { props: { open: true, method } })
    expect(document.body.textContent).toContain('Edit shipping method')
  })

  it('is axe-clean', async () => {
    await mountSuspended(ShippingMethodFormDialog, { props: { open: true, method: null } })
    const results = await axe(document.body, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
