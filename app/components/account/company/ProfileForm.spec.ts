// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import ProfileForm from './ProfileForm.vue'
import type { CompanyMe } from '~/composables/queries/useCompany'

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const company: CompanyMe = {
  id: 7,
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-01T10:00:00Z',
  name: 'Acme Sp. z o.o.',
  status: 'approved',
  role: 'COMPANY_ADMIN',
  tax_id: 'PL1234567890',
  regon: '123456789',
  email: 'billing@acme.test',
  phone: '+48 22 123 45 67',
  billing_address_street: 'ul. Testowa 1',
  billing_address_city: 'Warszawa',
  billing_address_postal_code: '00-001',
  billing_address_country: 'Poland',
  billing_address_state: 'Mazowieckie',
  default_currency: 'PLN',
  net_terms_enabled: false,
  auto_charge_enabled: false,
  vies_valid: false,
}

async function flush(wrapper: { vm: { $nextTick: () => Promise<void> } }) {
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
}

describe('AccountCompanyProfileForm', () => {
  it('prefills the fields from the company prop', async () => {
    const wrapper = await mountSuspended(ProfileForm, { props: { company } })
    const values = wrapper.findAll('input').map(i => (i.element as HTMLInputElement).value)
    expect(values).toContain('PL1234567890')
    expect(values).toContain('123456789')
    expect(values).toContain('billing@acme.test')
    expect(values).toContain('00-001')
    expect(values).toContain('PLN')
  })

  it('emits submit with the form values when valid', async () => {
    const wrapper = await mountSuspended(ProfileForm, { props: { company } })
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toMatchObject({
      tax_id: 'PL1234567890',
      regon: '123456789',
      email: 'billing@acme.test',
      default_currency: 'PLN',
    })
  })

  it('does not emit submit when a field is invalid (bad currency)', async () => {
    const bad: CompanyMe = { ...company, default_currency: 'EURO' }
    const wrapper = await mountSuspended(ProfileForm, { props: { company: bad } })
    await wrapper.find('form').trigger('submit')
    await flush(wrapper)
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('is axe-clean (all fields labelled)', async () => {
    const wrapper = await mountSuspended(ProfileForm, { props: { company } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
