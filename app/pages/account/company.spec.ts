// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'

/**
 * B2B company-profile page (D-D-4 + D-D-6).
 *
 * Role gate: COMPANY_ADMIN sees the editable `<AccountCompanyProfileForm>` and a
 * submit PATCHes the changed fields (toast on success, rollback-via-no-cache-
 * mutation + error toast on failure); BUYER/VIEWER see the read-only
 * `<AccountCompanyProfileView>`. A resolved 404 (not a member) shows a friendly
 * empty panel. The `useCompany` module + `useToast` are stubbed at the import /
 * auto-import boundary.
 */

const companyData = ref<any>(undefined)
const isLoading = ref(false)
const error = ref<unknown>(null)
const mutateAsync = vi.fn()
const viesVerify = vi.fn()
const toastAdd = vi.fn()

vi.mock('~/composables/queries/useCompany', () => ({
  useCompanyProfileQuery: () => ({ data: companyData, isLoading, error }),
  useUpdateCompanyProfile: () => ({ mutateAsync }),
  useVerifyMyCompanyVies: () => ({ mutateAsync: viesVerify }),
}))

const { mockUseToast } = vi.hoisted(() => ({ mockUseToast: vi.fn() }))
mockNuxtImport('useToast', () => mockUseToast)

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const tick = () => new Promise(r => setTimeout(r, 0))

function adminCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    name: 'Acme Sp. z o.o.',
    status: 'approved',
    role: 'COMPANY_ADMIN',
    tax_id: 'PL123',
    regon: null,
    email: 'billing@acme.test',
    phone: null,
    billing_address_street: null,
    billing_address_city: null,
    billing_address_postal_code: null,
    billing_address_country: null,
    billing_address_state: null,
    default_currency: 'PLN',
    ...overrides,
  }
}

async function mountPage() {
  const Page = (await import('./company.vue')).default
  return mountSuspended(Page, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

beforeEach(() => {
  companyData.value = undefined
  isLoading.value = false
  error.value = null
  mutateAsync.mockReset().mockResolvedValue(adminCompany())
  viesVerify.mockReset().mockResolvedValue(adminCompany())
  toastAdd.mockReset()
  mockUseToast.mockReturnValue({ add: toastAdd })
})

describe('account/settings/company', () => {
  it('renders the company name and status badge', async () => {
    companyData.value = adminCompany()
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.text()).toContain('Acme Sp. z o.o.')
    expect(wrapper.findComponent({ name: 'AccountCompanyStatusBadge' }).exists()).toBe(true)
  })

  it('shows the editable form for a COMPANY_ADMIN', async () => {
    companyData.value = adminCompany()
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.findComponent({ name: 'AccountCompanyProfileForm' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AccountCompanyProfileView' }).exists()).toBe(false)
  })

  it('shows the read-only view for a BUYER', async () => {
    companyData.value = adminCompany({ role: 'BUYER' })
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.findComponent({ name: 'AccountCompanyProfileView' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AccountCompanyProfileForm' }).exists()).toBe(false)
  })

  it('shows the read-only view for a VIEWER', async () => {
    companyData.value = adminCompany({ role: 'VIEWER' })
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.findComponent({ name: 'AccountCompanyProfileView' }).exists()).toBe(true)
  })

  it('verifies the EU VAT id via VIES and toasts success', async () => {
    companyData.value = adminCompany({ vat_id: 'DE811907980', vies_valid: false })
    viesVerify.mockResolvedValue(
      adminCompany({ vat_id: 'DE811907980', vies_valid: true, vies_confirmed_name: 'ACME' }),
    )
    const wrapper = await mountPage()
    await tick()
    const btn = wrapper.find('[data-testid="company-vies-verify"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await tick()
    expect(viesVerify).toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('PATCHes only the changed fields and toasts success', async () => {
    companyData.value = adminCompany()
    const wrapper = await mountPage()
    await tick()
    const form = wrapper.findComponent({ name: 'AccountCompanyProfileForm' })
    // Emit a submit where only regon changed vs the loaded company (was null).
    form.vm.$emit('submit', {
      tax_id: 'PL123',
      regon: '999',
      email: 'billing@acme.test',
      phone: '',
      billing_address_street: '',
      billing_address_city: '',
      billing_address_postal_code: '',
      billing_address_country: '',
      billing_address_state: '',
      default_currency: 'PLN',
    })
    await tick()
    expect(mutateAsync).toHaveBeenCalledWith({ regon: '999' })
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('does not PATCH when nothing changed', async () => {
    companyData.value = adminCompany()
    const wrapper = await mountPage()
    await tick()
    const form = wrapper.findComponent({ name: 'AccountCompanyProfileForm' })
    form.vm.$emit('submit', {
      tax_id: 'PL123',
      regon: '',
      email: 'billing@acme.test',
      phone: '',
      billing_address_street: '',
      billing_address_city: '',
      billing_address_postal_code: '',
      billing_address_country: '',
      billing_address_state: '',
      default_currency: 'PLN',
    })
    await tick()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('toasts an error and does not crash when the PATCH fails (rollback)', async () => {
    mutateAsync.mockRejectedValue(new Error('boom'))
    companyData.value = adminCompany()
    const wrapper = await mountPage()
    await tick()
    const form = wrapper.findComponent({ name: 'AccountCompanyProfileForm' })
    form.vm.$emit('submit', { ...adminCompany(), regon: '999' } as any)
    await tick()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    // The cached company is untouched on failure (non-optimistic) — still admin-editable.
    expect(wrapper.findComponent({ name: 'AccountCompanyProfileForm' }).exists()).toBe(true)
  })

  it('shows a friendly panel for a non-member (resolved 404)', async () => {
    companyData.value = undefined
    error.value = { status: 404 }
    isLoading.value = false
    const wrapper = await mountPage()
    await tick()
    expect(wrapper.findComponent({ name: 'AccountCompanyProfileForm' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'AccountCompanyProfileView' }).exists()).toBe(false)
    expect(wrapper.text()).toContain('not linked to a business')
  })
})
