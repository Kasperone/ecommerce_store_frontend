// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import AddressForm from './AddressForm.vue'
import type { Address } from '~/composables/queries/useAddresses'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const seeded: Address = {
  id: 1,
  created_at: '2026-05-28T10:00:00Z',
  updated_at: '2026-05-28T10:00:00Z',
  label: 'Home',
  recipient_name: 'Jane Doe',
  street: '1 Main St',
  city: 'Warsaw',
  postal_code: '00-001',
  country: 'PL',
  state: null,
  phone: null,
  is_default_shipping: true,
  is_default_billing: false,
  user_id: 7,
}

async function flush(wrapper: { vm: { $nextTick: () => Promise<void> } }) {
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
}

describe('AccountAddressesAddressForm', () => {
  it('prefills the fields from the address prop', async () => {
    const wrapper = await mountSuspended(AddressForm, { props: { address: seeded } })
    const values = wrapper.findAll('input').map(i => (i.element as HTMLInputElement).value)
    expect(values).toContain('Home')
    expect(values).toContain('Jane Doe')
    expect(values).toContain('1 Main St')
    expect(values).toContain('00-001')
  })

  it('emits submit with the normalized values when valid', async () => {
    const wrapper = await mountSuspended(AddressForm, { props: { address: seeded } })
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toMatchObject({
      recipient_name: 'Jane Doe',
      street: '1 Main St',
      city: 'Warsaw',
      postal_code: '00-001',
      country: 'PL',
      is_default_shipping: true,
      is_default_billing: false,
    })
  })

  it('does not emit submit when required fields are empty', async () => {
    const wrapper = await mountSuspended(AddressForm, { props: {} })
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('emits cancel when the cancel button is pressed', async () => {
    const wrapper = await mountSuspended(AddressForm, { props: {} })
    const cancel = wrapper.findAll('button').find(b => b.text() === 'Cancel')
    await cancel!.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(AddressForm, { props: { address: seeded } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
