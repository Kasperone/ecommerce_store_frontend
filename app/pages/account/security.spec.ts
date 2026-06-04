// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { SessionResponse } from '~/composables/queries/useSessions'

/**
 * Security settings page. It owns: the change-password form (validates, calls
 * `authStore.changePassword`, success/error toast + field reset), the sessions
 * table (fed by a client-gated Colada query), a revoke confirmation modal
 * (UModal → individual `it()` blocks, assert on `document.body.textContent`),
 * and "sign out everywhere" (POST /auth/logout-all via `apiFetch`, then
 * `clearSession` + redirect to /login).
 *
 * The Colada query/mutation composables, the auth store, `useApi`, `useToast`
 * and `useRouter.push` are all mocked at their auto-import boundaries.
 */

const SESSIONS: SessionResponse[] = [
  {
    id: 1,
    created_at: '2026-05-28T10:00:00Z',
    created_ip: '203.0.113.7',
    user_agent: 'Firefox on Linux',
    current: true,
    expires_at: '2026-06-28T10:00:00Z',
  },
  {
    id: 2,
    created_at: '2026-05-27T09:00:00Z',
    created_ip: '198.51.100.4',
    user_agent: 'Safari on iPhone',
    current: false,
    expires_at: '2026-06-27T09:00:00Z',
  },
]

const sessionsData = ref<SessionResponse[]>(SESSIONS)
const sessionsLoading = ref(false)
const revokeMutate = vi.fn()

vi.mock('~/composables/queries/useSessions', () => ({
  useSessionsQuery: () => ({ data: sessionsData, isLoading: sessionsLoading }),
  useRevokeSession: () => ({ mutateAsync: revokeMutate }),
}))

const changePassword = vi.fn()
const clearSession = vi.fn()
mockNuxtImport('useAuthStore', () => () => ({
  changePassword,
  clearSession,
}))

const toastAdd = vi.fn()
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

const apiFetch = vi.fn()
mockNuxtImport('useApi', () => () => ({ apiFetch }))

const routerPush = vi.fn()
mockNuxtImport('useRouter', (original: any) => () => {
  const real = original()
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'push') return routerPush
      return Reflect.get(target, prop, receiver)
    },
  })
})

const PassThroughStub = defineComponent({
  setup(_props, { slots }) {
    return () => h('div', slots.default?.())
  },
})

const tick = () => new Promise(r => setTimeout(r, 0))

async function mountPage() {
  const SecurityPage = (await import('./security.vue')).default
  return mountSuspended(SecurityPage, {
    global: { stubs: { NuxtLayout: PassThroughStub } },
  })
}

function setField(
  wrapper: Awaited<ReturnType<typeof mountPage>>,
  name: string,
  value: string,
) {
  return wrapper
    .findAllComponents({ name: 'UFormField' })
    .find(f => f.props('name') === name)!
    .find('input')
    .setValue(value)
}

// Page content lives in the (detached) mountSuspended wrapper; teleported
// modal content lands in document.body. Search BOTH so one helper covers
// in-page buttons (table Revoke, header "Sign out everywhere") and modal
// buttons alike.
function allButtons(wrapper: Awaited<ReturnType<typeof mountPage>>): HTMLButtonElement[] {
  const inPage = [...wrapper.element.querySelectorAll('button')] as HTMLButtonElement[]
  const inBody = [...document.body.querySelectorAll('button')] as HTMLButtonElement[]
  return [...new Set([...inPage, ...inBody])]
}

function buttonsByText(
  wrapper: Awaited<ReturnType<typeof mountPage>>,
  text: string,
): HTMLButtonElement[] {
  return allButtons(wrapper).filter(b => b.textContent?.trim() === text)
}

function combinedText(wrapper: Awaited<ReturnType<typeof mountPage>>): string {
  return `${wrapper.element.textContent ?? ''}${document.body.textContent ?? ''}`
}

beforeEach(() => {
  sessionsData.value = SESSIONS
  sessionsLoading.value = false
  revokeMutate.mockReset().mockResolvedValue(undefined)
  changePassword.mockReset().mockResolvedValue({ success: true, message: 'ok' })
  clearSession.mockReset()
  toastAdd.mockReset()
  apiFetch.mockReset().mockResolvedValue(undefined)
  routerPush.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('account/settings/security — change password', () => {
  it('changes the password and shows a success toast', async () => {
    const wrapper = await mountPage()
    await setField(wrapper, 'current_password', 'old-secret')
    await setField(wrapper, 'new_password', 'new-secret-1')
    await setField(wrapper, 'confirm_password', 'new-secret-1')

    await wrapper.find('form').trigger('submit')
    await tick()

    expect(changePassword).toHaveBeenCalledWith('old-secret', 'new-secret-1')
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' }),
    )
  })

  it('does not submit when the new password is too short', async () => {
    const wrapper = await mountPage()
    await setField(wrapper, 'current_password', 'old-secret')
    await setField(wrapper, 'new_password', 'short')
    await setField(wrapper, 'confirm_password', 'short')

    await wrapper.find('form').trigger('submit')
    await tick()

    expect(changePassword).not.toHaveBeenCalled()
  })

  it('does not submit when the confirmation does not match', async () => {
    const wrapper = await mountPage()
    await setField(wrapper, 'current_password', 'old-secret')
    await setField(wrapper, 'new_password', 'new-secret-1')
    await setField(wrapper, 'confirm_password', 'different-1')

    await wrapper.find('form').trigger('submit')
    await tick()

    expect(changePassword).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Passwords do not match')
  })

  it('shows an error toast when the change fails', async () => {
    changePassword.mockResolvedValue({ success: false, error: 'Wrong current password' })
    const wrapper = await mountPage()
    await setField(wrapper, 'current_password', 'wrong')
    await setField(wrapper, 'new_password', 'new-secret-1')
    await setField(wrapper, 'confirm_password', 'new-secret-1')

    await wrapper.find('form').trigger('submit')
    await tick()

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error', title: 'Wrong current password' }),
    )
  })
})

describe('account/settings/security — sessions list', () => {
  it('renders a row per session and badges the current one', async () => {
    const wrapper = await mountPage()
    expect(combinedText(wrapper)).toContain('Firefox on Linux')
    expect(combinedText(wrapper)).toContain('Safari on iPhone')
    expect(combinedText(wrapper)).toContain('This device')
  })
})

describe('account/settings/security — revoke a session', () => {
  it('opens the confirm modal when a session Revoke is pressed', async () => {
    const wrapper = await mountPage()
    buttonsByText(wrapper, 'Revoke')[0]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(document.body.textContent).toContain('Revoke this session?')
  })

  it('calls the revoke mutation on confirm and toasts success', async () => {
    const wrapper = await mountPage()
    // Open the modal (table row Revoke), then confirm (modal Revoke).
    buttonsByText(wrapper, 'Revoke')[0]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    // Two "Revoke" buttons now exist (row + modal). The last is the modal's.
    const revokeButtons = buttonsByText(wrapper, 'Revoke')
    revokeButtons[revokeButtons.length - 1]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()

    expect(revokeMutate).toHaveBeenCalledWith(2)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'success' }),
    )
  })
})

describe('account/settings/security — sign out everywhere', () => {
  it('opens the confirm modal when "Sign out everywhere" is pressed', async () => {
    const wrapper = await mountPage()
    buttonsByText(wrapper, 'Sign out everywhere')[0]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    expect(document.body.textContent).toContain('Sign out of all devices?')
  })

  it('calls logout-all, clears the session and redirects on confirm', async () => {
    const wrapper = await mountPage()
    buttonsByText(wrapper, 'Sign out everywhere')[0]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    // Within the open modal there are two "Sign out everywhere" buttons (header
    // trigger + modal confirm). The last is the modal's confirm.
    const confirmButtons = buttonsByText(wrapper, 'Sign out everywhere')
    confirmButtons[confirmButtons.length - 1]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/auth/logout-all', { method: 'POST' })
    expect(clearSession).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith('/login')
  })

  it('toasts an error and does not redirect when logout-all fails', async () => {
    apiFetch.mockRejectedValue(new Error('boom'))
    const wrapper = await mountPage()
    buttonsByText(wrapper, 'Sign out everywhere')[0]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()
    const confirmButtons = buttonsByText(wrapper, 'Sign out everywhere')
    confirmButtons[confirmButtons.length - 1]!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await tick()

    expect(clearSession).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error' }),
    )
  })
})
