// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import MemberActionConfirm from './MemberActionConfirm.vue'
import type { CompanyMemberResponse } from '~/composables/queries/useTeam'

/**
 * Stateless, parent-driven confirm modal for remove / suspend / reactivate. The
 * copy + confirm label switch on `action`; the member name is injected. Each
 * `it()` mounts its own teleported modal into document.body and asserts on
 * `document.body.textContent` — split into individual blocks so happy-dom's
 * teleport cleanup runs between cases.
 *
 * The wrapper is captured and **unmounted FIRST** in afterEach before wiping the
 * body — unmounting an open UModal leaves a teleport node whose nextSibling read
 * crashes in CI if the body is cleared out from under it (Wave-B banked gotcha).
 */

const AXE_OPTIONS = { rules: { 'aria-hidden-focus': { enabled: false } } }

const MEMBER: CompanyMemberResponse = {
  id: 1,
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-01T10:00:00Z',
  company_id: 3,
  user_id: 7,
  role: 'BUYER',
  status: 'active',
  invited_email: null,
  invited_at: null,
  user_email: 'bea@co.com',
  user_name: 'Bea Buyer',
}

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null

async function mountConfirm(props: Record<string, unknown>) {
  wrapper = await mountSuspended(MemberActionConfirm, {
    props: { open: true, member: MEMBER, ...props },
  })
  return wrapper
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined
}

afterEach(() => {
  // Unmount the modal BEFORE wiping the body (teleport nextSibling CI crash).
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('AccountTeamMemberActionConfirm', () => {
  it('shows the remove title and the member name', async () => {
    await mountConfirm({ action: 'remove' })
    expect(document.body.textContent).toContain('Remove member')
    expect(document.body.textContent).toContain('Bea Buyer')
  })

  it('shows the suspend title for the suspend action', async () => {
    await mountConfirm({ action: 'suspend' })
    expect(document.body.textContent).toContain('Suspend member')
  })

  it('shows the reactivate title for the reactivate action', async () => {
    await mountConfirm({ action: 'reactivate' })
    expect(document.body.textContent).toContain('Reactivate member')
  })

  it('emits confirm on the confirm button', async () => {
    const w = await mountConfirm({ action: 'remove' })
    buttonByText('Remove')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(w.emitted('confirm')).toHaveLength(1)
  })

  it('does not emit confirm while loading', async () => {
    const w = await mountConfirm({ action: 'remove', loading: true })
    buttonByText('Remove')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('emits cancel on the cancel button', async () => {
    const w = await mountConfirm({ action: 'suspend' })
    buttonByText('Cancel')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('surfaces a passed-in error', async () => {
    await mountConfirm({ action: 'remove', error: { title: 'Cannot remove the last admin' } })
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Cannot remove the last admin')
  })

  it('is axe-clean when open (focus-trapped dialog)', async () => {
    await mountConfirm({ action: 'remove' })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
