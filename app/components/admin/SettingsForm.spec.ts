// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import SettingsForm from './SettingsForm.vue'
import type { StoreConfigUpdate } from '~/composables/queries/useSettingsQueries'

/**
 * The settings form is a single-record edit form: it prefills from the loaded
 * `config` prop, and on Save emits the edited body for the parent page to PATCH.
 * The query/mutation URL+verb mapping is pinned in `useSettingsQueries.spec.ts`;
 * here we assert prefill, the emitted patch, client-side VAT validation, and
 * that a server error (e.g. a 422) surfaces via <ErrorAlert>.
 *
 * The form renders inline (not teleported), so we query through the wrapper's
 * own element, not `document` — `mountSuspended` mounts to a detached container.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    'label': { enabled: false },
    // UInputNumber renders a button-wrapped visually-hidden input → axe flags
    // nested-interactive; library rendering artifact, same posture as elsewhere.
    'nested-interactive': { enabled: false },
    // This is a bare form fragment in the test, not a full page — the page
    // shell provides the <main> landmark. Skip the page-level region rule.
    'region': { enabled: false },
  },
}

const config = {
  id: 1,
  store_name: 'Acme Store',
  brand_tagline: 'Quality goods',
  email_from_name: 'Acme Mail',
  primary_color: '#1e40af',
  logo_url: '',
  legal_name: 'Acme Sp. z o.o.',
  email: 'shop@acme.test',
  phone: '+48 22 000 00 00',
  address_line: '1 Market St',
  address_line2: '',
  postal_city: '00-001 Warsaw',
  country: 'Poland',
  nip: '1234567890',
  regon: '000000000',
  krs: '0000000000',
  social_instagram: '',
  social_facebook: '',
  social_tiktok: '',
  social_youtube: '',
  tax_id: 'PL1234567890',
  invoice_vat_rate: 23,
  returns_window_days: 30,
  low_stock_default_threshold: 5,
  abandoned_cart_enabled: false,
  abandoned_cart_threshold_hours: 24,
  gift_cards_enabled: false,
  store_credit_enabled: false,
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('SettingsForm', () => {
  it('prefills the inputs from the loaded config', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    const values = wrapper.findAll('input').map(i => (i.element as HTMLInputElement).value)
    expect(values).toContain('Acme Store')
    expect(values).toContain('shop@acme.test')
    expect(values).toContain('PL1234567890')
    expect(values).toContain('Poland')
    expect(values).toContain('23')
  })

  it('emits the edited body on save', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    // First UInput is store_name (identity section, top field).
    inputs[0]!.vm.$emit('update:modelValue', 'Acme Renamed')
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    const submits = wrapper.emitted('submit')
    expect(submits).toBeTruthy()
    expect(submits![0]![0]).toMatchObject({
      store_name: 'Acme Renamed',
      email: 'shop@acme.test',
      tax_id: 'PL1234567890',
      invoice_vat_rate: 23,
      returns_window_days: 30,
    })
  })

  it('prefills + emits the edited returns window (Returns/RMA v1)', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    // Prefilled from the loaded config.
    expect((wrapper.vm as any).state.returns_window_days).toBe(30)
    // Second UInputNumber is returns_window_days (after invoice_vat_rate).
    const returnsWindow = wrapper.findAllComponents({ name: 'UInputNumber' })[1]!
    returnsWindow.vm.$emit('update:modelValue', 14)
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    const submits = wrapper.emitted('submit')
    expect(submits).toBeTruthy()
    expect(submits![0]![0]).toMatchObject({ returns_window_days: 14 })
  })

  it('prefills + emits the edited low-stock default threshold', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    // Prefilled from the loaded config.
    expect((wrapper.vm as any).state.low_stock_default_threshold).toBe(5)
    // Third UInputNumber is low_stock_default_threshold (after VAT + returns).
    const threshold = wrapper.findAllComponents({ name: 'UInputNumber' })[2]!
    threshold.vm.$emit('update:modelValue', 8)
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    const submits = wrapper.emitted('submit')
    expect(submits).toBeTruthy()
    expect(submits![0]![0]).toMatchObject({ low_stock_default_threshold: 8 })
  })

  it('emits null for the low-stock threshold when the field is cleared', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    const threshold = wrapper.findAllComponents({ name: 'UInputNumber' })[2]!
    threshold.vm.$emit('update:modelValue', undefined)
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    const submits = wrapper.emitted('submit')
    expect(submits).toBeTruthy()
    const [payload] = submits![0]! as [StoreConfigUpdate]
    expect(payload.low_stock_default_threshold).toBeNull()
  })

  it('blocks save and does not emit when the low-stock threshold is negative', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    const threshold = wrapper.findAllComponents({ name: 'UInputNumber' })[2]!
    threshold.vm.$emit('update:modelValue', -3)
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('prefills + emits the abandoned-cart toggle and threshold', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    // Prefilled from the loaded config.
    expect((wrapper.vm as any).state.abandoned_cart_enabled).toBe(false)
    expect((wrapper.vm as any).state.abandoned_cart_threshold_hours).toBe(24)

    // Flip the toggle on and shorten the threshold.
    const toggle = wrapper.findComponent({ name: 'USwitch' })
    toggle.vm.$emit('update:modelValue', true)
    // Fourth UInputNumber is abandoned_cart_threshold_hours (after VAT +
    // returns + low-stock).
    const threshold = wrapper.findAllComponents({ name: 'UInputNumber' })[3]!
    threshold.vm.$emit('update:modelValue', 6)
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    const submits = wrapper.emitted('submit')
    expect(submits).toBeTruthy()
    expect(submits![0]![0]).toMatchObject({
      abandoned_cart_enabled: true,
      abandoned_cart_threshold_hours: 6,
    })
  })

  it('blocks save and does not emit when the abandoned-cart threshold is out of range', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    const threshold = wrapper.findAllComponents({ name: 'UInputNumber' })[3]!
    threshold.vm.$emit('update:modelValue', 0) // backend CHECK is >= 1
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('submit')).toBeFalsy()

    threshold.vm.$emit('update:modelValue', 721) // schema cap is <= 720
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('prefills + emits the gift-cards and store-credit toggles', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    // Prefilled from the loaded config (both ship dark = false).
    expect((wrapper.vm as any).state.gift_cards_enabled).toBe(false)
    expect((wrapper.vm as any).state.store_credit_enabled).toBe(false)

    // Switch order: abandoned-cart, gift cards, store credit.
    const switches = wrapper.findAllComponents({ name: 'USwitch' })
    expect(switches.length).toBeGreaterThanOrEqual(3)
    switches[1]!.vm.$emit('update:modelValue', true)
    switches[2]!.vm.$emit('update:modelValue', true)
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    const submits = wrapper.emitted('submit')
    expect(submits).toBeTruthy()
    expect(submits![0]![0]).toMatchObject({
      gift_cards_enabled: true,
      store_credit_enabled: true,
    })
  })

  it('blocks save and does not emit when the returns window is negative', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    const returnsWindow = wrapper.findAllComponents({ name: 'UInputNumber' })[1]!
    returnsWindow.vm.$emit('update:modelValue', -1)
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('blocks save and does not emit when the VAT rate is out of range', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    const vat = wrapper.findAllComponents({ name: 'UInputNumber' })[0]!
    vat.vm.$emit('update:modelValue', 150)
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('saves with blank optional identity fields (the seeded store_config state)', async () => {
    // store_config is seeded with only store_name + invoice_vat_rate; the rest
    // are blank and optional (the backend accepts empty). The form must NOT block
    // save on the blank identity fields — regression for the over-strict required
    // schema that made the seeded settings page unsaveable.
    const seeded = {
      ...config,
      address_line: '',
      postal_city: '',
      country: '',
      tax_id: '',
      email: '',
    }
    const wrapper = await mountSuspended(SettingsForm, { props: { config: seeded } })
    const vat = wrapper.findAllComponents({ name: 'UInputNumber' })[0]!
    vat.vm.$emit('update:modelValue', 7)
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    const submits = wrapper.emitted('submit')
    expect(submits).toBeTruthy()
    expect(submits![0]![0]).toMatchObject({ invoice_vat_rate: 7, email: '', postal_city: '' })
  })

  it('blocks save when an email is entered but malformed', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    // Email is the third UInput (identity section: store_name, legal_name, email).
    const inputs = wrapper.findAllComponents({ name: 'UInput' })
    inputs[2]!.vm.$emit('update:modelValue', 'not-an-email')
    await new Promise(r => setTimeout(r, 0))

    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))

    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('surfaces a server error via the form alert (e.g. a 422)', async () => {
    // The parent passes the raw caught error; the gold-standard flow normalizes
    // its `detail` into the inline UAlert. Set it after mount so the null→error
    // transition fires the watch (matches real usage).
    const wrapper = await mountSuspended(SettingsForm, { props: { config, error: null } })
    await wrapper.setProps({
      error: { data: { detail: 'invoice_vat_rate must be between 0 and 100' } },
    })
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('invoice_vat_rate must be between 0 and 100')
  })

  it('is axe-clean', async () => {
    const wrapper = await mountSuspended(SettingsForm, { props: { config } })
    expect(await axe(wrapper.element, AXE_OPTIONS)).toHaveNoViolations()
  })
})
