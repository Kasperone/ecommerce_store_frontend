// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { VueWrapper } from '@vue/test-utils'
import type { SessionResponse } from '~/composables/queries/useSessions'
import SessionsTable from './SessionsTable.vue'

/**
 * Stateless, parent-driven sessions table (renders inline, not a teleported
 * modal — so assert against the wrapper, not document.body). We assert it
 * renders one row per session, badges the current one, omits the revoke button
 * on the current row, emits `revoke` with the session on a non-current Revoke
 * press, shows loading / empty states, and is axe-clean (real table headers).
 */

function makeSession(over: Partial<SessionResponse> = {}): SessionResponse {
  return {
    id: 1,
    created_at: '2026-05-28T10:00:00Z',
    created_ip: '203.0.113.7',
    user_agent: 'Mozilla/5.0 Firefox',
    current: false,
    expires_at: '2026-06-28T10:00:00Z',
    ...over,
  }
}

// `region` fires because we axe the bare table in isolation — in the page it
// lives inside a <UCard>/section landmark. Not a component defect.
const AXE_OPTIONS = {
  rules: {
    region: { enabled: false },
  },
}

function revokeButtons(wrapper: VueWrapper): HTMLButtonElement[] {
  return [...wrapper.element.querySelectorAll('button')].filter(
    b => b.textContent?.trim() === 'Revoke',
  ) as HTMLButtonElement[]
}

describe('account/security/SessionsTable', () => {
  it('renders one row per session', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: {
        sessions: [
          makeSession({ id: 1, user_agent: 'Firefox on Linux' }),
          makeSession({ id: 2, user_agent: 'Safari on iPhone' }),
        ],
      },
    })
    expect(wrapper.text()).toContain('Firefox on Linux')
    expect(wrapper.text()).toContain('Safari on iPhone')
  })

  it('badges the current session', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: { sessions: [makeSession({ current: true })] },
    })
    expect(wrapper.text()).toContain('This device')
  })

  it('omits the revoke button on the current session', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: { sessions: [makeSession({ id: 5, current: true })] },
    })
    expect(revokeButtons(wrapper)).toHaveLength(0)
  })

  it('shows a revoke button on a non-current session', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: { sessions: [makeSession({ id: 5, current: false })] },
    })
    expect(revokeButtons(wrapper)).toHaveLength(1)
  })

  it('emits revoke with the session on Revoke', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: { sessions: [makeSession({ id: 9, current: false })] },
    })
    revokeButtons(wrapper)[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('revoke')?.[0]?.[0]).toMatchObject({ id: 9 })
  })

  it('shows a loading state when loading with no rows', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: { sessions: [], loading: true },
    })
    expect(wrapper.text()).toContain('Loading sessions')
  })

  it('shows an empty state when there are no sessions', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: { sessions: [] },
    })
    expect(wrapper.text()).toContain('No active sessions')
  })

  it('falls back to a label when the user agent is null', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: { sessions: [makeSession({ user_agent: null })] },
    })
    expect(wrapper.text()).toContain('Unknown device')
  })

  it('disables the revoking row button while that id is in flight', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: { sessions: [makeSession({ id: 3, current: false })], revokingId: 3 },
    })
    expect(revokeButtons(wrapper)[0]!.disabled).toBe(true)
  })

  it('has accessible table headers and is axe-clean', async () => {
    const wrapper = await mountSuspended(SessionsTable, {
      props: { sessions: [makeSession({ id: 1 }), makeSession({ id: 2, current: true })] },
    })
    const table = wrapper.element.querySelector('table') as HTMLElement
    expect(table).toBeTruthy()
    expect(table.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(0)
    expect(await axe(table, AXE_OPTIONS)).toHaveNoViolations()
  })
})
