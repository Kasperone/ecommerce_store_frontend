// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { axe } from 'vitest-axe'
import type { CategoryTreeNode as CategoryTreeNodeType } from '#shared/types/api'
import CategoryTreeNode from './CategoryTreeNode.vue'

const AXE_OPTIONS = {
  rules: {
    'aria-hidden-focus': { enabled: false },
    // Tree nodes render inside the page's <main> landmark in production.
    // In isolation (component test), there's no surrounding landmark —
    // silence the rule so the test isn't load-bearing for page structure.
    'region': { enabled: false },
    // Same isolation argument for <li> outside a <ul>: in the page the node
    // is rendered inside the root <ul ref="rootListRef">.
    'listitem': { enabled: false },
  },
}

function makeNode(overrides: Partial<CategoryTreeNodeType> = {}): CategoryTreeNodeType {
  return {
    id: 1,
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

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('CategoryTreeNode', () => {
  it('renders the node name and slug', async () => {
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: {
        node: makeNode({ name: 'Furniture', slug: 'furniture' }),
        depth: 0,
        expandedIds: new Set(),
      },
    })
    expect(wrapper.text()).toContain('Furniture')
    expect(wrapper.text()).toContain('/furniture')
  })

  it('does NOT render the children list when collapsed', async () => {
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: {
        node: makeNode({
          id: 1,
          name: 'Root',
          children: [makeNode({ id: 2, name: 'Child', slug: 'child' })],
        }),
        depth: 0,
        expandedIds: new Set(),
      },
    })
    // The <ul data-children-list> renders but is v-show'd false → not visible.
    // happy-dom keeps it in the DOM with display:none, so we check the
    // visible text instead.
    expect(wrapper.text()).toContain('Root')
    expect(wrapper.text()).not.toContain('Child')
  })

  it('renders the children list when expanded', async () => {
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: {
        node: makeNode({
          id: 1,
          name: 'Root',
          children: [makeNode({ id: 2, name: 'Child', slug: 'child' })],
        }),
        depth: 0,
        expandedIds: new Set([1]),
      },
    })
    expect(wrapper.text()).toContain('Root')
    expect(wrapper.text()).toContain('Child')
  })

  it('emits toggleExpand with the node id when the chevron is clicked', async () => {
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: {
        node: makeNode({
          id: 42,
          children: [makeNode({ id: 99, slug: 'c' })],
        }),
        depth: 0,
        expandedIds: new Set(),
      },
    })
    const chevron = wrapper.find('button[aria-label="Expand"]')
    expect(chevron.exists()).toBe(true)
    await chevron.trigger('click')
    expect(wrapper.emitted('toggleExpand')).toBeTruthy()
    expect(wrapper.emitted('toggleExpand')?.[0]).toEqual([42])
  })

  it('emits edit / move / delete on the corresponding action buttons', async () => {
    const node = makeNode({ id: 7, name: 'Edit me' })
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: { node, depth: 0, expandedIds: new Set() },
    })
    await wrapper.find('button[aria-label="Edit category"]').trigger('click')
    await wrapper.find('button[aria-label="Move under…"]').trigger('click')
    await wrapper.find('button[aria-label="Delete"]').trigger('click')
    expect(wrapper.emitted('edit')?.[0]?.[0]).toEqual(node)
    expect(wrapper.emitted('move')?.[0]?.[0]).toEqual(node)
    expect(wrapper.emitted('delete')?.[0]?.[0]).toEqual(node)
  })

  it('shows the inactive badge for is_active=false', async () => {
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: {
        node: makeNode({ is_active: false }),
        depth: 0,
        expandedIds: new Set(),
      },
    })
    expect(wrapper.text()).toContain('Inactive only')
  })

  it('shows the product count badge', async () => {
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: {
        node: makeNode({ product_count: 12 }),
        depth: 0,
        expandedIds: new Set(),
      },
    })
    expect(wrapper.text()).toContain('12')
  })

  it('does not render the chevron when the node is a leaf', async () => {
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: {
        node: makeNode({ children: [] }),
        depth: 0,
        expandedIds: new Set(),
      },
    })
    expect(wrapper.find('button[aria-label="Expand"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Collapse"]').exists()).toBe(false)
  })

  it('is axe-clean for a basic node', async () => {
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: {
        node: makeNode({ name: 'Axe test' }),
        depth: 0,
        expandedIds: new Set(),
      },
    })
    expect(await axe(wrapper.element as HTMLElement, AXE_OPTIONS)).toHaveNoViolations()
  })

  it('indents deeper nodes via the padding-left style', async () => {
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: {
        node: makeNode({ name: 'Deep' }),
        depth: 2,
        expandedIds: new Set(),
      },
    })
    const row = wrapper.find('[data-category-id="1"] > div')
    const style = row.attributes('style') ?? ''
    // 2 * 1.25 + 0.75 = 3.25rem at depth 2
    expect(style).toMatch(/padding-left/)
    expect(style).toMatch(/3\.25rem/)
  })

  it('renders children when the parent id appears in expandedIds at mount', async () => {
    // Sibling test to "renders the children list when expanded" — this one
    // proves the prop reactivity contract at mount time, which is how the
    // page wires it (the Set is re-created on each toggle for prop-ref
    // identity, then passed in).
    const node = makeNode({
      id: 5,
      slug: 's-5',
      children: [makeNode({ id: 6, slug: 'c-6' })],
    })
    const wrapper = await mountSuspended(CategoryTreeNode, {
      props: { node, depth: 0, expandedIds: new Set([5]) },
    })
    expect(wrapper.text()).toContain('c-6')
  })
})
