// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import CategoryFormModal from './CategoryFormModal.vue'

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

function getInput(name: string): HTMLInputElement | HTMLTextAreaElement | null {
  return document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | null
}

describe('CategoryFormModal', () => {
  it('auto-slugifies the name on blur when the slug is untouched', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const nameInput = getInput('name') as HTMLInputElement
    expect(nameInput).toBeTruthy()
    nameInput.value = 'Cooking & Wine'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    const slugInput = getInput('slug') as HTMLInputElement
    expect(slugInput.value).toBe('cooking-and-wine')
  })

  it('respects a manually edited slug — does not overwrite on subsequent name blur', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const slugInput = getInput('slug') as HTMLInputElement
    slugInput.value = 'custom-slug'
    slugInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    const nameInput = getInput('name') as HTMLInputElement
    nameInput.value = 'Different name'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    nameInput.dispatchEvent(new Event('blur', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))

    expect(slugInput.value).toBe('custom-slug')
  })

  it('renders the cancel and save buttons', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const labels = [...document.querySelectorAll('button')].map(b => b.textContent?.trim())
    expect(labels).toContain('Cancel')
    expect(labels).toContain('Save')
  })

  it('renders edit title when a category is provided', async () => {
    await mountSuspended(CategoryFormModal, {
      props: {
        open: true,
        category: {
          id: 1,
          name: 'Books',
          slug: 'books',
          description: 'Printed reads',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      },
    })
    expect(document.body.textContent).toContain('Edit category')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CategoryFormModal, {
      props: { open: true, category: null },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
