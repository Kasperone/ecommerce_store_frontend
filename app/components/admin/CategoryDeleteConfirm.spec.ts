// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type {
  CategoryDeletePreview,
  CategoryTreeNode,
} from '#shared/types/api'
import CategoryDeleteConfirm from './CategoryDeleteConfirm.vue'

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
  },
}

function makeCategory(overrides: Partial<CategoryTreeNode> = {}): CategoryTreeNode {
  return {
    id: 7,
    name: 'Books',
    slug: 'books',
    description: null,
    is_active: true,
    parent_id: null,
    sort_order: 0,
    product_count: 0,
    children: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function preview(over: Partial<CategoryDeletePreview> = {}): CategoryDeletePreview {
  return {
    descendant_count: 0,
    direct_product_count: 0,
    subtree_product_count: 0,
    ...over,
  }
}

// Each test renders a UModal into document.body. Clean up between tests so
// queries don't pick up the previous modal's nodes.
afterEach(() => {
  document.body.innerHTML = ''
})

function findRadio(value: string): HTMLElement | undefined {
  return [...document.querySelectorAll('[role="radio"]')].find(
    el => el.getAttribute('value') === value,
  ) as HTMLElement | undefined
}

function radioDisabled(el: HTMLElement): boolean {
  return el.hasAttribute('data-disabled')
}

describe('CategoryDeleteConfirm', () => {
  it('shows the leaf copy and enables Delete for a clean leaf', async () => {
    await mountSuspended(CategoryDeleteConfirm, {
      props: {
        open: true,
        category: makeCategory(),
        preview: preview(),
      },
    })
    expect(document.body.textContent).toContain('permanently removed')
    const deleteBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement
    expect(deleteBtn).toBeTruthy()
    expect(deleteBtn.disabled).toBe(false)
  })

  it('disables every mode when direct products are attached', async () => {
    await mountSuspended(CategoryDeleteConfirm, {
      props: {
        open: true,
        category: makeCategory({ product_count: 3 }),
        preview: preview({ direct_product_count: 3, subtree_product_count: 3 }),
      },
    })
    expect(document.body.textContent).toContain('3 products')
    expect(radioDisabled(findRadio('none')!)).toBe(true)
    expect(radioDisabled(findRadio('reparent_to_root')!)).toBe(true)
  })

  it('emits {id, mode: "cascade"} when cascade is selected and confirmed', async () => {
    const wrapper = await mountSuspended(CategoryDeleteConfirm, {
      props: {
        open: true,
        category: makeCategory({ id: 9 }),
        preview: preview({ descendant_count: 2 }),
      },
    })
    // immediate watch picks 'cascade' by default for a no-product subtree
    const cascadeRadio = findRadio('cascade')!
    expect(radioDisabled(cascadeRadio)).toBe(false)
    cascadeRadio.click()
    await new Promise(r => setTimeout(r, 0))
    const deleteBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({ id: 9, mode: 'cascade' })
  })

  it('emits {id, mode: "reparent_to_root"} for the reparent path', async () => {
    const wrapper = await mountSuspended(CategoryDeleteConfirm, {
      props: {
        open: true,
        category: makeCategory({ id: 11 }),
        preview: preview({ descendant_count: 1 }),
      },
    })
    const reparentRadio = findRadio('reparent_to_root')!
    reparentRadio.click()
    await new Promise(r => setTimeout(r, 0))
    const deleteBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement
    deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({
      id: 11,
      mode: 'reparent_to_root',
    })
  })

  it('disables cascade mode when the subtree carries products', async () => {
    await mountSuspended(CategoryDeleteConfirm, {
      props: {
        open: true,
        category: makeCategory(),
        preview: preview({
          descendant_count: 1,
          direct_product_count: 0,
          subtree_product_count: 4,
        }),
      },
    })
    expect(radioDisabled(findRadio('cascade')!)).toBe(true)
  })

  it('falls back to product_count from category when preview is null', async () => {
    await mountSuspended(CategoryDeleteConfirm, {
      props: {
        open: true,
        category: makeCategory({ product_count: 2 }),
        preview: null,
      },
    })
    expect(document.body.textContent).toContain('2 products')
  })

  it('is axe-clean when open', async () => {
    await mountSuspended(CategoryDeleteConfirm, {
      props: {
        open: true,
        category: makeCategory(),
        preview: preview(),
      },
    })
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).toBeTruthy()
    expect(await axe(dialog, AXE_OPTIONS)).toHaveNoViolations()
  })
})
