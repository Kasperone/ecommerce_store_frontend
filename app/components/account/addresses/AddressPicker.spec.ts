// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AddressPicker from './AddressPicker.vue'
import type { Address } from '~/composables/queries/useAddresses'

function makeAddress(over: Partial<Address>): Address {
  return {
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
    is_default_shipping: false,
    is_default_billing: false,
    user_id: 7,
    ...over,
  }
}

const addresses: Address[] = [
  makeAddress({ id: 1, label: 'Home', is_default_shipping: true }),
  makeAddress({ id: 2, label: 'Office', street: '99 Market Rd', city: 'Berlin', country: 'DE' }),
]

describe('AccountAddressesAddressPicker', () => {
  it('renders nothing when there are no saved addresses', async () => {
    const wrapper = await mountSuspended(AddressPicker, {
      props: { addresses: [], modelValue: null },
    })
    expect(wrapper.find('.c-address-picker').exists()).toBe(false)
  })

  it('lists each saved address plus an "enter a new address" option', async () => {
    const wrapper = await mountSuspended(AddressPicker, {
      props: { addresses, modelValue: 1 },
    })
    expect(wrapper.text()).toContain('Use a saved address')
    const select = wrapper.findComponent({ name: 'USelect' })
    const items = select.props('items') as { label: string, value: string }[]
    expect(items.map(i => i.value)).toEqual(['1', '2', '__new__'])
    expect(items.find(i => i.value === '__new__')!.label).toBe('Enter a new address')
  })

  it('emits the chosen address id (number) on change', async () => {
    const wrapper = await mountSuspended(AddressPicker, {
      props: { addresses, modelValue: 1 },
    })
    const select = wrapper.findComponent({ name: 'USelect' })
    select.vm.$emit('update:modelValue', '2')
    expect(wrapper.emitted('update:modelValue')![0]![0]).toBe(2)
  })

  it('emits null when "enter a new address" is chosen', async () => {
    const wrapper = await mountSuspended(AddressPicker, {
      props: { addresses, modelValue: 1 },
    })
    const select = wrapper.findComponent({ name: 'USelect' })
    select.vm.$emit('update:modelValue', '__new__')
    expect(wrapper.emitted('update:modelValue')![0]![0]).toBeNull()
  })
})
