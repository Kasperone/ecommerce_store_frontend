// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import GiftCardField from './GiftCardField.vue'

/**
 * Pins the gift-card field UI contract against a stubbed `useCheckGiftCard` +
 * `useStoreConfig`. The redemption HTTP call is exercised on the backend; here
 * we assert the D7 toggle gating, the entry→applied toggle, the success emit,
 * each pinned machine-code error (mapped to copy via `giftCardCheckErrorKey`),
 * the remove path, and the re-check-on-currency-change (D3 single-currency).
 *
 * `useStoreConfig` returns a `useAsyncData`-shaped `{ data: Ref }`; a real
 * module-scope ref (post-imports) lets the factory close over it and the
 * component's `computed` react to it. `useCheckGiftCard` returns
 * `{ mutateAsync, isLoading }`.
 */

const mutateAsync = vi.fn()
const isLoadingRef = ref(false)
const storeConfigData = ref<{ gift_cards_enabled?: boolean } | null>({ gift_cards_enabled: true })

mockNuxtImport('useCheckGiftCard', () => () => ({
  mutateAsync,
  isLoading: isLoadingRef,
}))

mockNuxtImport('useStoreConfig', () => () => ({
  data: storeConfigData,
}))

beforeEach(() => {
  mutateAsync.mockReset()
  isLoadingRef.value = false
  storeConfigData.value = { gift_cards_enabled: true }
})

afterEach(() => {
  vi.clearAllMocks()
})

const tick = () => new Promise(r => setTimeout(r, 0))

function mount(props: Record<string, unknown> = {}) {
  return mountSuspended(GiftCardField, {
    props: { currency: 'USD', orderTotal: 100, modelValue: null, ...props },
  })
}

const APPLIED = { code: 'ABCD1234EFGH5678', last4: '5678', balance: 30, currency: 'USD' }

describe('CheckoutGiftCardField', () => {
  it('renders nothing when gift_cards_enabled is off (ships dark, D7)', async () => {
    storeConfigData.value = { gift_cards_enabled: false }
    const wrapper = await mount()
    expect(wrapper.find('[data-testid="gift-card-field"]').exists()).toBe(false)
  })

  it('renders the entry form (apply disabled until a code is typed) when enabled', async () => {
    const wrapper = await mount()
    expect(wrapper.find('[data-testid="gift-card-entry"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gift-card-apply"]').attributes('disabled')).toBeDefined()
  })

  it('checks the code and emits the applied gift card (keeping the plaintext code)', async () => {
    mutateAsync.mockResolvedValue({ last4: '5678', balance: 30, currency: 'USD' })
    const wrapper = await mount()
    await wrapper.find('input').setValue('abcd1234efgh5678')
    await wrapper.find('[data-testid="gift-card-entry"]').trigger('submit')
    await tick()

    expect(mutateAsync).toHaveBeenCalledWith({ code: 'abcd1234efgh5678', currency: 'USD' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      code: 'abcd1234efgh5678',
      last4: '5678',
      balance: 30,
      currency: 'USD',
    })
  })

  it('renders the applied state: masked code, balance and coverage = min(balance, total)', async () => {
    const wrapper = await mount({ modelValue: { ...APPLIED }, orderTotal: 20 })
    expect(wrapper.find('[data-testid="gift-card-applied"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gift-card-masked"]').text()).toContain('5678')
    // balance $30 but total only $20 → coverage capped at $20.
    expect(wrapper.find('[data-testid="gift-card-coverage"]').text()).toContain('$20.00')
    expect(wrapper.find('[data-testid="gift-card-entry"]').exists()).toBe(false)
  })

  it('coverage equals the balance when the total exceeds it', async () => {
    const wrapper = await mount({ modelValue: { ...APPLIED }, orderTotal: 100 })
    expect(wrapper.find('[data-testid="gift-card-coverage"]').text()).toContain('$30.00')
  })

  it('emits null when remove is clicked', async () => {
    const wrapper = await mount({ modelValue: { ...APPLIED } })
    await wrapper.find('[data-testid="gift-card-remove"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBeNull()
  })

  const ERROR_CASES: [string, number, string][] = [
    ['gift_card_not_found', 404, 'couldn\'t find a gift card'],
    ['gift_card_disabled', 409, 'been disabled'],
    ['gift_card_expired', 409, 'has expired'],
    ['gift_card_depleted', 409, 'no balance left'],
    ['gift_card_currency_mismatch', 409, 'can\'t be used in this currency'],
    ['gift_cards_disabled', 409, 'aren\'t accepted'],
  ]

  it.each(ERROR_CASES)('maps the %s machine code to a localized message', async (detail, status, needle) => {
    mutateAsync.mockRejectedValue({ status, data: { detail } })
    const wrapper = await mount()
    await wrapper.find('input').setValue('BADCODE0000000000')
    await wrapper.find('[data-testid="gift-card-entry"]').trigger('submit')
    await tick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBeNull()
    expect(wrapper.find('[data-testid="gift-card-error"]').text().toLowerCase()).toContain(needle.toLowerCase())
  })

  it('maps a 429 to the rate-limited message (prose detail, not a machine code)', async () => {
    mutateAsync.mockRejectedValue({ status: 429, data: { detail: 'Rate limit exceeded' } })
    const wrapper = await mount()
    await wrapper.find('input').setValue('ABCD1234EFGH5678')
    await wrapper.find('[data-testid="gift-card-entry"]').trigger('submit')
    await tick()

    expect(wrapper.find('[data-testid="gift-card-error"]').text()).toContain('Too many attempts')
  })

  it('re-checks an applied card when the currency changes and clears it on mismatch (D3)', async () => {
    mutateAsync.mockRejectedValue({ status: 409, data: { detail: 'gift_card_currency_mismatch' } })
    const wrapper = await mount({ modelValue: { ...APPLIED } })
    await wrapper.setProps({ currency: 'PLN' })
    await tick()

    expect(mutateAsync).toHaveBeenCalledWith({ code: APPLIED.code, currency: 'PLN' })
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBeNull()
    // The parent clears the card (v-model) → the entry form (+ error) renders.
    await wrapper.setProps({ modelValue: null })
    expect(wrapper.find('[data-testid="gift-card-error"]').text()).toContain('can\'t be used in this currency')
  })

  it('re-checks and refreshes the balance when the currency changes to one the card supports', async () => {
    mutateAsync.mockResolvedValue({ last4: '5678', balance: 120, currency: 'PLN' })
    const wrapper = await mount({ modelValue: { ...APPLIED } })
    await wrapper.setProps({ currency: 'PLN' })
    await tick()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      code: APPLIED.code,
      last4: '5678',
      balance: 120,
      currency: 'PLN',
    })
  })
})
