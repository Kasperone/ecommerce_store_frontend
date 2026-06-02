// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import BusinessSignUpForm from './BusinessSignUpForm.vue'

/**
 * `BusinessSignUpForm` — B2B self-signup (Wave D / D-D-5). It collects the
 * personal account fields + the company name/tax id and posts via
 * `authStore.registerBusiness` (`POST /auth/register-business`), NOT the personal
 * `register`. Validation gates + the password-match cross-field check run for
 * real through UAuthForm; the auth store is mocked at the module level.
 */

const { mockRegisterBusiness, mockRegister, mockPush, mockToastAdd } = vi.hoisted(() => ({
  mockRegisterBusiness: vi.fn(),
  mockRegister: vi.fn(),
  mockPush: vi.fn(),
  mockToastAdd: vi.fn(),
}))

mockNuxtImport('useRouter', (original: any) => () => {
  const real = original()
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'push') return mockPush
      return Reflect.get(target, prop, receiver)
    },
  })
})
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => ({
    register: mockRegister,
    registerBusiness: mockRegisterBusiness,
  }),
}))

const validBusinessInput = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@acme.test',
  password: 'Sup3rSecret!',
  confirmPassword: 'Sup3rSecret!',
  companyName: 'Acme Corp',
}

async function fillForm(wrapper: any, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    const input = wrapper.find(`input[name="${name}"]`)
    if (input.exists()) {
      await input.setValue(value)
    }
  }
}

async function submitForm(wrapper: any) {
  await wrapper.find('form').trigger('submit')
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
}

describe('BusinessSignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mounts and renders the personal + company fields', async () => {
    const wrapper = await mountSuspended(BusinessSignUpForm)
    const html = wrapper.html().toLowerCase()
    expect(html).toContain('first')
    expect(html).toContain('email')
    expect(html).toContain('password')
    expect(html).toContain('company')
  })

  it('on a valid submit, calls registerBusiness (not register) and routes to the email-sent page', async () => {
    mockRegisterBusiness.mockResolvedValueOnce({ success: true, data: { message: 'check your email' } })
    const wrapper = await mountSuspended(BusinessSignUpForm)

    await fillForm(wrapper, validBusinessInput)
    await submitForm(wrapper)

    expect(mockRegisterBusiness).toHaveBeenCalledTimes(1)
    expect(mockRegister).not.toHaveBeenCalled()
    // The submitted payload carries the company name + the personal fields.
    expect(mockRegisterBusiness.mock.calls[0]![0]).toMatchObject({
      email: 'ada@acme.test',
      firstName: 'Ada',
      companyName: 'Acme Corp',
    })
    expect(mockPush).toHaveBeenCalledWith(
      `/verify-email-sent?email=${encodeURIComponent('ada@acme.test')}`,
    )
  })

  it('blocks submit when required fields are empty (Zod validation)', async () => {
    const wrapper = await mountSuspended(BusinessSignUpForm)

    await submitForm(wrapper)

    expect(mockRegisterBusiness).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('blocks submit when the company name is missing', async () => {
    const wrapper = await mountSuspended(BusinessSignUpForm)

    const { companyName: _omit, ...withoutCompany } = validBusinessInput
    await fillForm(wrapper, withoutCompany)
    await submitForm(wrapper)

    expect(mockRegisterBusiness).not.toHaveBeenCalled()
  })

  it('blocks submit and surfaces the password-match error when passwords differ', async () => {
    const wrapper = await mountSuspended(BusinessSignUpForm)

    await fillForm(wrapper, { ...validBusinessInput, confirmPassword: 'totally-different' })
    await submitForm(wrapper)

    expect(mockRegisterBusiness).not.toHaveBeenCalled()
    expect(wrapper.html()).toContain('Passwords do not match')
  })

  it('on a failed register, surfaces the error and does not navigate', async () => {
    mockRegisterBusiness.mockResolvedValueOnce({ success: false, error: 'Weak password' })
    const wrapper = await mountSuspended(BusinessSignUpForm)

    await fillForm(wrapper, validBusinessInput)
    await submitForm(wrapper)

    expect(mockRegisterBusiness).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(wrapper.html()).toContain('Weak password')
  })
})
