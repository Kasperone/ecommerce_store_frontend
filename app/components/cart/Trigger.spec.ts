// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import Trigger from './Trigger.vue'

const { openDrawer, countRef } = vi.hoisted(() => ({ openDrawer: vi.fn(), countRef: { value: 0 } }))
mockNuxtImport('useCartStore', () => () => ({ count: countRef.value, openDrawer }))

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

beforeEach(() => {
  openDrawer.mockReset()
  countRef.value = 0
})

describe('CartTrigger', () => {
  it('shows the item count when the cart has items', async () => {
    countRef.value = 3
    const wrapper = await mountSuspended(Trigger)
    expect(wrapper.text()).toContain('3')
  })

  it('opens the drawer on click', async () => {
    const wrapper = await mountSuspended(Trigger)
    await wrapper.find('button').trigger('click')
    expect(openDrawer).toHaveBeenCalledTimes(1)
  })

  it('is axe-clean', async () => {
    countRef.value = 2
    const wrapper = await mountSuspended(Trigger)
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
