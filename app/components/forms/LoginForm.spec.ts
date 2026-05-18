// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import LoginForm from './LoginForm.vue'

/**
 * `LoginForm` integration tests — mount the real component, drive the
 * UAuthForm submit, and assert against the auth-store action and router.
 *
 * The auth store is mocked at the module level (we don't run the real
 * /login HTTP path here — that's covered by the auth-store unit tests).
 *
 * Routing helpers (`useRouter`, `useRoute`, `useToast`) are stubbed via
 * `mockNuxtImport`. We don't assert on toast contents — only that the
 * post-submit navigation ends up at the expected path.
 */

const { mockLogin, mockPush, mockRoute, mockToastAdd } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockPush: vi.fn(),
  mockRoute: { query: {} as Record<string, any> },
  mockToastAdd: vi.fn(),
}))

// Partial-mock `useRouter` so Nuxt's internal plugins still get `afterEach` /
// `beforeResolve` etc., but the component sees our spy `push`.
mockNuxtImport('useRouter', (original: any) => () => {
  const real = original()
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'push') return mockPush
      return Reflect.get(target, prop, receiver)
    },
  })
})
mockNuxtImport('useRoute', () => () => mockRoute)
mockNuxtImport('useToast', () => () => ({ add: mockToastAdd }))

vi.mock('~/stores/auth', () => ({
  useAuthStore: () => ({
    login: mockLogin,
    isAdmin: false,
  }),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRoute.query = {}
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mounts and renders the email + password fields', async () => {
    const wrapper = await mountSuspended(LoginForm)
    const html = wrapper.html()
    expect(html.toLowerCase()).toContain('email')
    expect(html.toLowerCase()).toContain('password')
  })

  it('on a successful submit, calls authStore.login and navigates to /account for non-admins', async () => {
    mockLogin.mockResolvedValueOnce({ success: true, data: {} })
    const wrapper = await mountSuspended(LoginForm)

    await wrapper.find('input[name="email"]').setValue('ada@example.com')
    await wrapper.find('input[name="password"]').setValue('Sup3rSecret!')
    await wrapper.find('form').trigger('submit')
    // Vue form submission is async; let microtasks settle.
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    expect(mockLogin).toHaveBeenCalledWith('ada@example.com', 'Sup3rSecret!')
    expect(mockPush).toHaveBeenCalledWith('/account')
  })

  it('honors a ?redirect= query param when present, even for non-admins', async () => {
    mockRoute.query = { redirect: '/account/profile' }
    mockLogin.mockResolvedValueOnce({ success: true, data: {} })
    const wrapper = await mountSuspended(LoginForm)

    await wrapper.find('input[name="email"]').setValue('ada@example.com')
    await wrapper.find('input[name="password"]').setValue('Sup3rSecret!')
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    expect(mockPush).toHaveBeenCalledWith('/account/profile')
  })

  it('on a failed submit, surfaces the error and does not navigate', async () => {
    mockLogin.mockResolvedValueOnce({
      success: false,
      error: 'Invalid credentials',
    })
    const wrapper = await mountSuspended(LoginForm)

    await wrapper.find('input[name="email"]').setValue('ada@example.com')
    await wrapper.find('input[name="password"]').setValue('wrongpw1')
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    expect(mockLogin).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    // The error toast or alert surfaces the message somewhere in the rendered output.
    expect(wrapper.html()).toContain('Invalid credentials')
  })

  it('blocks submit and shows validation errors when the form is empty', async () => {
    const wrapper = await mountSuspended(LoginForm)

    // Submit without filling anything — Zod schema runs on submit.
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 0))
    await wrapper.vm.$nextTick()

    expect(mockLogin).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
