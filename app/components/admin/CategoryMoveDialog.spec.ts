// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { CategoryTreeNode as CategoryTreeNodeType } from '#shared/types/api'
import CategoryMoveDialog from './CategoryMoveDialog.vue'

function makeNode(overrides: Partial<CategoryTreeNodeType> = {}): CategoryTreeNodeType {
  return {
    id: 1,
    name: 'Root',
    slug: 'root',
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

function buildFixture(): {
  tree: CategoryTreeNodeType[]
  byId: Record<number, CategoryTreeNodeType>
} {
  const grandchild = makeNode({
    id: 3,
    name: 'Sub-Sub',
    slug: 'sub-sub',
    parent_id: 2,
  })
  const child = makeNode({
    id: 2,
    name: 'Sub',
    slug: 'sub',
    parent_id: 1,
    children: [grandchild],
  })
  const root = makeNode({
    id: 1,
    name: 'Top',
    slug: 'top',
    children: [child],
  })
  const sibling = makeNode({
    id: 4,
    name: 'Other root',
    slug: 'other',
  })
  return {
    tree: [root, sibling],
    byId: { 1: root, 2: child, 3: grandchild, 4: sibling },
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

function radioValues(): string[] {
  return [...document.querySelectorAll('[role="radio"]')]
    .map(el => el.getAttribute('value') ?? '')
}

function findRadio(value: string): HTMLElement | undefined {
  return [...document.querySelectorAll('[role="radio"]')].find(
    el => el.getAttribute('value') === value,
  ) as HTMLElement | undefined
}

describe('CategoryMoveDialog', () => {
  it('lists every other node as an eligible parent when moving a leaf', async () => {
    const { tree, byId } = buildFixture()
    await mountSuspended(CategoryMoveDialog, {
      props: { open: true, node: byId[3], tree },
    })
    const values = radioValues()
    expect(values).toContain('root')
    expect(values).toContain('1') // Top
    expect(values).toContain('2') // Sub (moving node is 3, so Sub is still eligible as parent)
    expect(values).toContain('4') // Other root
  })

  it('filters out the moving node itself + its descendants', async () => {
    const { tree, byId } = buildFixture()
    // Moving "Sub" (id=2). Should hide id=2 (self) and id=3 (descendant).
    await mountSuspended(CategoryMoveDialog, {
      props: { open: true, node: byId[2], tree },
    })
    const values = radioValues()
    expect(values).toContain('1') // Top, eligible
    expect(values).toContain('4') // Other root, eligible
    expect(values).toContain('root')
    expect(values).not.toContain('2') // self
    expect(values).not.toContain('3') // descendant
  })

  it('emits cancel when the cancel button is clicked', async () => {
    const { tree, byId } = buildFixture()
    const wrapper = await mountSuspended(CategoryMoveDialog, {
      props: { open: true, node: byId[2], tree },
    })
    const cancelBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement
    cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('keeps Move disabled when the selection matches the current parent', async () => {
    const { tree, byId } = buildFixture()
    // Sub-Sub starts under "Sub" (parent_id=2). Default selection matches
    // current parent → Move stays disabled.
    await mountSuspended(CategoryMoveDialog, {
      props: { open: true, node: byId[3], tree },
    })
    const moveBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Move',
    ) as HTMLButtonElement
    expect(moveBtn).toBeTruthy()
    expect(moveBtn.disabled).toBe(true)
  })

  it('enables Move once a new parent is picked', async () => {
    const { tree, byId } = buildFixture()
    const wrapper = await mountSuspended(CategoryMoveDialog, {
      props: { open: true, node: byId[3], tree },
    })
    // Sub-Sub starts under Sub (id 2). Click "Root" instead.
    const rootRadio = findRadio('root')!
    rootRadio.click()
    await new Promise(r => setTimeout(r, 0))
    const moveBtn = [...document.querySelectorAll('button')].find(
      b => b.textContent?.trim() === 'Move',
    ) as HTMLButtonElement
    expect(moveBtn.disabled).toBe(false)
    moveBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({ id: 3, parentId: null })
  })

  it('surfaces an error alert when the error prop is set (e.g. a depth-violating move)', async () => {
    const { tree, byId } = buildFixture()
    await mountSuspended(CategoryMoveDialog, {
      props: {
        open: true,
        node: byId[3],
        tree,
        error: { title: 'Maximum category depth exceeded' },
      },
    })
    const alert = document.querySelector('[role="alert"]')
    expect(alert).toBeTruthy()
    expect(alert?.textContent).toContain('Maximum category depth exceeded')
  })

  it('renders no error alert when error is null', async () => {
    const { tree, byId } = buildFixture()
    await mountSuspended(CategoryMoveDialog, {
      props: { open: true, node: byId[3], tree, error: null },
    })
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
})
