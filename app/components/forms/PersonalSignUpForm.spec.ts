// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import PersonalSignUpForm from './PersonalSignUpForm.vue'

/**
 * `PersonalSignUpForm` — happy-path register, validation gates, and the
 * password-match cross-field check via `superRefine`.
 *
 * Auth store is mocked at the module level. UAuthForm's submit pipeline runs
 * for real (Zod validation, slot rendering, etc.) — that's the surface area
 * this component owns.
 */

const { mockRegister, mockPush, mockToastAdd } = vi.hoisted(() => ({
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
  }),
}))

const validPersonalInput = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  password: 'Sup3rSecret!',
  confirmPassword: 'Sup3rSecret!',
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
  // Let microtasks settle (validation runs async, then submit handler resolves)
  await new Promise(r => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
}

describe('PersonalSignUpForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mounts and renders the required name/email/password fields', async () => {
    const wrapper = await mountSuspended(PersonalSignUpForm)
    const html = wrapper.html().toLowerCase()
    expect(html).toContain('first')
    expect(html).toContain('last')
    expect(html).toContain('email')
    expect(html).toContain('password')
  })

  it('on a successful submit, calls register and routes to the email-sent page', async () => {
    mockRegister.mockResolvedValueOnce({ success: true, data: { message: 'check your email' } })
    const wrapper = await mountSuspended(PersonalSignUpForm)

    await fillForm(wrapper, validPersonalInput)
    await submitForm(wrapper)

    expect(mockRegister).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith(
      `/verify-email-sent?email=${encodeURIComponent('ada@example.com')}`,
    )
  })

  it('blocks submit when required fields are empty (Zod validation)', async () => {
    const wrapper = await mountSuspended(PersonalSignUpForm)

    await submitForm(wrapper)

    expect(mockRegister).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('blocks submit and surfaces the password-match error when passwords differ', async () => {
    const wrapper = await mountSuspended(PersonalSignUpForm)

    await fillForm(wrapper, {
      ...validPersonalInput,
      confirmPassword: 'totally-different',
    })
    await submitForm(wrapper)

    expect(mockRegister).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    // The schema's password-match message lands in the rendered output.
    expect(wrapper.html()).toContain('Passwords do not match')
  })

  it('on a failed register, surfaces the error and does not navigate', async () => {
    mockRegister.mockResolvedValueOnce({
      success: false,
      error: 'Email already registered',
    })
    const wrapper = await mountSuspended(PersonalSignUpForm)

    await fillForm(wrapper, validPersonalInput)
    await submitForm(wrapper)

    expect(mockRegister).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(wrapper.html()).toContain('Email already registered')
  })
})
