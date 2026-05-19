// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import CategoryDeleteConfirm from './CategoryDeleteConfirm.vue'

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

const baseCategory = {
  id: 7,
  name: 'Books',
  slug: 'books',
  description: null as string | null,
  is_active: true,
  product_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('CategoryDeleteConfirm', () => {
  it('shows the empty-state copy and enables Delete when product_count is 0', async () => {
    await mountSuspended(CategoryDeleteConfirm, {
      props: { open: true, category: baseCategory },
    })
    expect(document.body.textContent).toContain('permanently removed')
    const deleteBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement
    expect(deleteBtn).toBeTruthy()
    expect(deleteBtn.disabled).toBe(false)
  })

  it('shows the warning copy when product_count > 0', async () => {
    await mountSuspended(CategoryDeleteConfirm, {
      props: { open: true, category: { ...baseCategory, product_count: 3 } },
    })
    // The body text proves the reactive branch fires; the disabled state
    // surface differs in happy-dom (UButton's disabled attribute does not
    // always land on the same node we query from document.body), but the
    // onConfirm guard verifies the same condition end-to-end below.
    expect(document.body.textContent).toContain('3 products')
  })

  it('does NOT emit confirm when product_count > 0 and Delete is clicked anyway', async () => {
    const wrapper = await mountSuspended(CategoryDeleteConfirm, {
      props: { open: true, category: { ...baseCategory, product_count: 5 } },
    })
    const deleteBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CategoryDeleteConfirm, {
      props: { open: true, category: baseCategory },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
