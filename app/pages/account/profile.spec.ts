// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { UserResponse } from '#shared/types/api'

/**
 * Profile settings page. The page owns: seeding the form from `authStore.user`
 * (kept in step via a `watch`), client-side validation (names required, phone
 * loose), and saving via `authStore.updateProfile` with a success/failure toast.
 *
 * `useAuthStore` is mocked to a reactive `user` ref + an `updateProfile` spy
 * (the `watch` needs a real `ref`, so it's declared at module scope and the
 * `mockNuxtImport` factory closes over it — see the testing rule). `useToast`
 * is stubbed at the auto-import boundary.
 */

const USER: UserResponse = {
  email: 'shopper@example.com',
  first_name: 'Ada',
  last_name: 'Lovelace',
  phone: '+44 123 456',
  locale: 'en',
  is_active: true,
  is_verified: true,
  role: 'CUSTOMER',
  is_owner: false,
  capabilities: [],
  created_at: '2026-05-28T00:00:00Z',
  updated_at: '2026-05-28T00:00:00Z',
}

const userRef = ref<UserResponse | null>(null)
const updateProfile = vi.fn()
const toastAdd = vi.fn()

mockNuxtImport('useAuthStore', () => () => ({
  get user() {
    return userRef.value
  },
  updateProfile,
}))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const tick = () => new Promise(r => setTimeout(r, 0))

async function mountPage(user: UserResponse | null = USER) {
  userRef.value = user
  const ProfilePage = (await import('./profile.vue')).default
  const wrapper = await mountSuspended(ProfilePage, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
  return wrapper
}

function findInput(wrapper: Awaited<ReturnType<typeof mountPage>>, name: string) {
  return wrapper
    .findAllComponents({ name: 'UFormField' })
    .find(f => f.props('name') === name)!
    .find('input')
}

beforeEach(() => {
  userRef.value = null
  updateProfile.mockReset().mockResolvedValue({ success: true, data: USER })
  toastAdd.mockReset()
})

describe('account/settings/profile', () => {
  it('seeds the form fields from the store user', async () => {
    const wrapper = await mountPage()
    expect((findInput(wrapper, 'first_name').element as HTMLInputElement).value).toBe('Ada')
    expect((findInput(wrapper, 'last_name').element as HTMLInputElement).value).toBe('Lovelace')
    expect((findInput(wrapper, 'phone').element as HTMLInputElement).value).toBe('+44 123 456')
  })

  it('renders the email read-only and disabled', async () => {
    const wrapper = await mountPage()
    const emailInput = findInput(wrapper, 'email').element as HTMLInputElement
    expect(emailInput.value).toBe('shopper@example.com')
    expect(emailInput.disabled).toBe(true)
  })

  it('re-seeds the form when the store user refreshes', async () => {
    const wrapper = await mountPage()
    userRef.value = { ...USER, first_name: 'Grace', last_name: 'Hopper', phone: null }
    await nextTick()
    await nextTick()
    expect((findInput(wrapper, 'first_name').element as HTMLInputElement).value).toBe('Grace')
    expect((findInput(wrapper, 'last_name').element as HTMLInputElement).value).toBe('Hopper')
    expect((findInput(wrapper, 'phone').element as HTMLInputElement).value).toBe('')
  })

  it('saves with the trimmed payload and shows a success toast', async () => {
    const wrapper = await mountPage()
    await findInput(wrapper, 'first_name').setValue('  Bob  ')
    await findInput(wrapper, 'last_name').setValue('Smith')
    await findInput(wrapper, 'phone').setValue('  555-0100  ')
    await wrapper.find('form').trigger('submit')
    await tick()

    expect(updateProfile).toHaveBeenCalledTimes(1)
    expect(updateProfile).toHaveBeenCalledWith({
      first_name: 'Bob',
      last_name: 'Smith',
      phone: '555-0100',
    })
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' }),
    )
  })

  it('sends phone as null when cleared', async () => {
    const wrapper = await mountPage()
    await findInput(wrapper, 'phone').setValue('')
    await wrapper.find('form').trigger('submit')
    await tick()

    expect(updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null }),
    )
  })

  it('does not call updateProfile when a required name is blank', async () => {
    const wrapper = await mountPage()
    await findInput(wrapper, 'first_name').setValue('')
    await wrapper.find('form').trigger('submit')
    await tick()

    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('shows a validation error on a blank required name', async () => {
    const wrapper = await mountPage()
    await findInput(wrapper, 'first_name').setValue('')
    await wrapper.find('form').trigger('submit')
    await tick()

    expect(wrapper.text()).toContain('First name is required')
  })

  it('rejects an invalid phone and does not save', async () => {
    const wrapper = await mountPage()
    await findInput(wrapper, 'phone').setValue('abc!!')
    await wrapper.find('form').trigger('submit')
    await tick()

    expect(updateProfile).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Enter a valid phone number')
  })

  it('shows an error toast when the save fails', async () => {
    updateProfile.mockResolvedValue({ success: false, error: 'Boom', raw: null })
    const wrapper = await mountPage()
    await wrapper.find('form').trigger('submit')
    await tick()

    // Gold-standard flow: generic title + the server message in the description.
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error', description: 'Boom' }),
    )
  })
})
