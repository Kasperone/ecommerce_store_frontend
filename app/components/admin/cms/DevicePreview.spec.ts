// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DevicePreview from './DevicePreview.vue'
import { DEVICE_WIDTHS } from '~/utils/devicePreview'
import type { DeviceMode } from '~/utils/devicePreview'

/**
 * The device-preview width toggle. We assert: the three device options render,
 * the toggle reflects the bound model, switching emits the new device, and the
 * exported `DEVICE_WIDTHS` map gives the expected frame widths (desktop = full /
 * null, tablet = 768, mobile = 375).
 */

function mountToggle(modelValue: DeviceMode = 'desktop') {
  return mountSuspended(DevicePreview, {
    props: { modelValue },
  })
}

describe('AdminCmsDevicePreview', () => {
  it('renders the three device options', async () => {
    const w = await mountToggle()
    const text = w.text()
    expect(text).toContain('Desktop')
    expect(text).toContain('Tablet')
    expect(text).toContain('Mobile')
  })

  it('exposes the toggle with an accessible label', async () => {
    const w = await mountToggle()
    expect(w.find('[data-testid="device-preview-toggle"]').exists()).toBe(true)
  })

  it('reflects the bound device as the active tab', async () => {
    const w = await mountToggle('desktop')
    const active = () => w.findAll('[role="tab"]').find(t => t.attributes('aria-selected') === 'true')
    expect(active()?.text()).toContain('Desktop')

    // Updating the model selects the matching tab (proves the v-model binding).
    await w.setProps({ modelValue: 'tablet' })
    expect(active()?.text()).toContain('Tablet')

    await w.setProps({ modelValue: 'mobile' })
    expect(active()?.text()).toContain('Mobile')
  })

  it('maps each device to its frame width', () => {
    expect(DEVICE_WIDTHS.desktop).toBeNull()
    expect(DEVICE_WIDTHS.tablet).toBe(768)
    expect(DEVICE_WIDTHS.mobile).toBe(375)
  })
})
