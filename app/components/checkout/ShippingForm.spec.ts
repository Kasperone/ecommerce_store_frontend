// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ShippingForm from './ShippingForm.vue'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const filled = { address: '1 Main St', city: 'Town', postalCode: '00-001', country: 'Poland' }

async function flush(wrapper: { vm: { $nextTick: () => Promise<void> } }) {
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
}

describe('CheckoutShippingForm', () => {
  it('prefills the fields from the initial values', async () => {
    const wrapper = await mountSuspended(ShippingForm, { props: { initial: filled } })
    const values = wrapper.findAll('input').map(i => (i.element as HTMLInputElement).value)
    expect(values).toContain('1 Main St')
    expect(values).toContain('Town')
  })

  it('emits submit with the values when valid', async () => {
    const wrapper = await mountSuspended(ShippingForm, { props: { initial: filled } })
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toMatchObject(filled)
  })

  it('does not emit submit when required fields are empty', async () => {
    const wrapper = await mountSuspended(ShippingForm, { props: {} })
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(ShippingForm, { props: { initial: filled } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
