// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { CURRENCIES } from '#shared/utils/money'
import type { CurrencyCode } from '#shared/utils/money'

/**
 * Preferences settings page. It owns two independent controls:
 *
 * - **Currency** — persisted via the `useUpdatePreferences` mutation (PATCH
 *   `/me/preferences`); on success it applies storewide through
 *   `useCurrencyPreference().setCurrency`, on failure it rolls the cookie back
 *   and toasts an error.
 * - **Email language** — persisted via `authStore.updateProfile({ locale })`
 *   (re-homed from the old /account hub), with rollback + error toast.
 *
 * The Colada query/mutation module + `useCurrencyPreference` are stubbed at the
 * import boundary; `useAuthStore` and `useToast` at the auto-import boundary.
 */

const currencyRef = ref<CurrencyCode>('USD')
const setCurrency = vi.fn((code: CurrencyCode) => {
  currencyRef.value = code
})
const preferencesData = ref<{ preferred_currency?: CurrencyCode | null } | undefined>(undefined)
const mutateAsync = vi.fn()

const localeRef = ref<'en' | 'pl'>('en')
const updateProfile = vi.fn()
const toastAdd = vi.fn()

mockNuxtImport('useCurrencyPreference', () => () => ({
  currency: currencyRef,
  setCurrency,
  currencies: CURRENCIES,
}))
mockNuxtImport('useAuthStore', () => () => ({
  get user() {
    return { email: 'shopper@example.com', locale: localeRef.value }
  },
  get isAuthenticated() {
    return true
  },
  updateProfile,
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

vi.mock('~/composables/queries/usePreferences', () => ({
  usePreferencesQuery: () => ({ data: preferencesData }),
  useUpdatePreferences: () => ({ mutateAsync }),
}))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const tick = () => new Promise(r => setTimeout(r, 0))

async function mountPage() {
  const Page = (await import('./preferences.vue')).default
  return mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

function selects(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  return wrapper.findAllComponents({ name: 'USelect' })
}

beforeEach(() => {
  currencyRef.value = 'USD'
  preferencesData.value = undefined
  localeRef.value = 'en'
  setCurrency.mockClear()
  mutateAsync.mockReset().mockResolvedValue({ preferred_currency: 'PLN', locale: 'en' })
  updateProfile.mockReset().mockResolvedValue({ success: true })
  toastAdd.mockReset()
})

describe('account/settings/preferences', () => {
  it('renders a currency select and an email-language select', async () => {
    const wrapper = await mountPage()
    expect(selects(wrapper)).toHaveLength(2)
  })

  it('seeds the currency select from the persisted preference when present', async () => {
    preferencesData.value = { preferred_currency: 'EUR' }
    const wrapper = await mountPage()
    expect(selects(wrapper)[0]!.props('modelValue')).toBe('EUR')
  })

  it('falls back to the live currency when no preference is persisted', async () => {
    currencyRef.value = 'PLN'
    preferencesData.value = undefined
    const wrapper = await mountPage()
    expect(selects(wrapper)[0]!.props('modelValue')).toBe('PLN')
  })

  it('changing currency calls the PATCH mutation and persists storewide', async () => {
    const wrapper = await mountPage()
    selects(wrapper)[0]!.vm.$emit('update:modelValue', 'PLN')
    await tick()

    expect(mutateAsync).toHaveBeenCalledWith({ preferred_currency: 'PLN' })
    expect(setCurrency).toHaveBeenCalledWith('PLN')
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('rolls back and toasts an error when the currency PATCH fails', async () => {
    mutateAsync.mockRejectedValue(new Error('boom'))
    const wrapper = await mountPage()
    selects(wrapper)[0]!.vm.$emit('update:modelValue', 'EUR')
    await tick()

    expect(setCurrency).not.toHaveBeenCalled()
    expect(currencyRef.value).toBe('USD') // rolled back
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
  })

  it('does not call the mutation when the currency is unchanged', async () => {
    const wrapper = await mountPage()
    selects(wrapper)[0]!.vm.$emit('update:modelValue', 'USD') // same as current
    await tick()

    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('seeds the email-language select from the user locale', async () => {
    localeRef.value = 'pl'
    const wrapper = await mountPage()
    expect(selects(wrapper)[1]!.props('modelValue')).toBe('pl')
  })

  it('changing email language calls updateProfile with the new locale', async () => {
    const wrapper = await mountPage()
    selects(wrapper)[1]!.vm.$emit('update:modelValue', 'pl')
    await tick()

    expect(updateProfile).toHaveBeenCalledWith({ locale: 'pl' })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('rolls back the email-language select and toasts on failure', async () => {
    updateProfile.mockResolvedValue({ success: false, error: 'Boom' })
    const wrapper = await mountPage()
    selects(wrapper)[1]!.vm.$emit('update:modelValue', 'pl')
    await tick()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error', title: 'Boom' }),
    )
    // Rolled back to the stored locale.
    expect(selects(wrapper)[1]!.props('modelValue')).toBe('en')
  })

  it('does not call updateProfile when the email language is unchanged', async () => {
    const wrapper = await mountPage()
    selects(wrapper)[1]!.vm.$emit('update:modelValue', 'en') // same as current
    await tick()

    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('labels both selects for assistive tech', async () => {
    const wrapper = await mountPage()
    // Nuxt UI renders the aria-label onto the underlying combobox button.
    const labelled = wrapper.findAll('[role="combobox"][aria-label]')
    expect(labelled).toHaveLength(2)
    for (const el of labelled) {
      expect(el.attributes('aria-label')).toBeTruthy()
    }
  })
})
