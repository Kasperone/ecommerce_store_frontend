// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import DeleteAccountConfirm from './DeleteAccountConfirm.vue'

/**
 * Stateless, parent-driven delete-account confirm. We assert the copy states it
 * is IRREVERSIBLE + anonymizes data, emits `confirm` on Delete, won't emit while
 * loading, surfaces a passed-in error, and is axe-clean (focus-trapped dialog).
 * Each `it()` mounts its own modal into document.body and asserts on
 * `document.body.textContent` — split into individual blocks so happy-dom's
 * teleport cleanup runs between cases.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

function deleteButton(): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find(
    b => b.textContent?.trim() === 'Delete account',
  ) as HTMLButtonElement
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('DeleteAccountConfirm', () => {
  it('states the action is irreversible', async () => {
    await mountSuspended(DeleteAccountConfirm, { props: { open: true } })
    expect(document.body.textContent).toContain('This cannot be undone')
  })

  it('states it anonymizes personal data', async () => {
    await mountSuspended(DeleteAccountConfirm, { props: { open: true } })
    expect(document.body.textContent?.toLowerCase()).toContain('anonymizes')
  })

  it('emits confirm on Delete', async () => {
    const wrapper = await mountSuspended(DeleteAccountConfirm, { props: { open: true } })
    deleteButton().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('does not emit confirm while loading', async () => {
    const wrapper = await mountSuspended(DeleteAccountConfirm, {
      props: { open: true, loading: true },
    })
    const btn = deleteButton()
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('surfaces a passed-in error', async () => {
    await mountSuspended(DeleteAccountConfirm, {
      props: { open: true, error: { title: 'Deletion failed' } },
    })
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Deletion failed')
  })

  it('is axe-clean when open (focus-trapped dialog)', async () => {
    await mountSuspended(DeleteAccountConfirm, { props: { open: true } })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
