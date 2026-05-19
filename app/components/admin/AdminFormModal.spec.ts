// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import AdminFormModal from './AdminFormModal.vue'

/**
 * Modal interactions (close on escape, focus trap) are owned by reka-ui under
 * the hood. These specs just assert the slot/event contract we expose.
 *
 * `aria-hidden-focus` is disabled in axe runs because Nuxt UI's modal sets
 * `aria-hidden=true` on the dialog root when the open transition is mid-flight,
 * which lights up the rule with happy-dom even though it's correct at runtime.
 */

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

describe('AdminFormModal', () => {
  it('renders the title in the teleported dialog', async () => {
    await mountSuspended(AdminFormModal, {
      props: { open: true, title: 'New category' },
    })
    expect(document.body.textContent).toContain('New category')
  })

  it('renders both default footer buttons by their copy', async () => {
    await mountSuspended(AdminFormModal, {
      props: { open: true, title: 'New category', submitLabel: 'Save', cancelLabel: 'Cancel' },
    })
    const labels = [...document.querySelectorAll('button')].map(b => b.textContent?.trim())
    expect(labels).toContain('Cancel')
    expect(labels).toContain('Save')
  })

  it('exposes a body slot for the form content', async () => {
    await mountSuspended(AdminFormModal, {
      props: { open: true, title: 'New category' },
      slots: {
        body: () => 'My form fields go here',
      },
    })
    expect(document.body.textContent).toContain('My form fields go here')
  })

  it('is axe-clean when open (ignoring the reka-ui aria-hidden timing rule)', async () => {
    await mountSuspended(AdminFormModal, {
      props: { open: true, title: 'New category', description: 'Add a new category' },
    })
    // Scope to the dialog container; document.body picks up extra teleport scaffolding.
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
