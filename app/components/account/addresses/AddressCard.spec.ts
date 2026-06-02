// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import AddressCard from './AddressCard.vue'
import type { Address } from '~/composables/queries/useAddresses'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const base: Address = {
  id: 3,
  created_at: '2026-05-28T10:00:00Z',
  updated_at: '2026-05-28T10:00:00Z',
  label: 'Home',
  recipient_name: 'Jane Doe',
  street: '1 Main St',
  city: 'Warsaw',
  postal_code: '00-001',
  country: 'PL',
  state: null,
  phone: '+48 600 700 800',
  is_default_shipping: false,
  is_default_billing: false,
  user_id: 7,
}

describe('AccountAddressesAddressCard', () => {
  it('renders the address fields and localizes the country', async () => {
    const wrapper = await mountSuspended(AddressCard, { props: { address: base } })
    expect(wrapper.text()).toContain('Jane Doe')
    expect(wrapper.text()).toContain('1 Main St')
    expect(wrapper.text()).toContain('00-001')
    expect(wrapper.text()).toContain('Warsaw')
    // Country code resolves to its localized name.
    expect(wrapper.text()).toContain('Poland')
    expect(wrapper.text()).toContain('+48 600 700 800')
  })

  it('badges a default-shipping / default-billing address', async () => {
    const wrapper = await mountSuspended(AddressCard, {
      props: { address: { ...base, is_default_shipping: true, is_default_billing: true } },
    })
    expect(wrapper.text()).toContain('Default shipping')
    expect(wrapper.text()).toContain('Default billing')
    // No "set as default" actions when already default for both.
    expect(wrapper.text()).not.toContain('Set as default shipping')
    expect(wrapper.text()).not.toContain('Set as default billing')
  })

  it('emits edit / delete with the address', async () => {
    const wrapper = await mountSuspended(AddressCard, { props: { address: base } })
    const editBtn = wrapper.findAll('button').find(
      b => b.attributes('aria-label') === 'Edit address',
    )
    const delBtn = wrapper.findAll('button').find(
      b => b.attributes('aria-label') === 'Delete address',
    )
    await editBtn!.trigger('click')
    await delBtn!.trigger('click')
    expect(wrapper.emitted('edit')![0]![0]).toMatchObject({ id: 3 })
    expect(wrapper.emitted('delete')![0]![0]).toMatchObject({ id: 3 })
  })

  it('emits set-default-shipping / set-default-billing', async () => {
    const wrapper = await mountSuspended(AddressCard, { props: { address: base } })
    const shipBtn = wrapper.findAll('button').find(
      b => b.text() === 'Set as default shipping',
    )
    const billBtn = wrapper.findAll('button').find(
      b => b.text() === 'Set as default billing',
    )
    await shipBtn!.trigger('click')
    await billBtn!.trigger('click')
    expect(wrapper.emitted('set-default-shipping')![0]![0]).toMatchObject({ id: 3 })
    expect(wrapper.emitted('set-default-billing')![0]![0]).toMatchObject({ id: 3 })
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(AddressCard, { props: { address: base } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
