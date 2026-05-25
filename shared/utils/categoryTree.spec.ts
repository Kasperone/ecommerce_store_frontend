import { describe, expect, it } from 'vitest'
import type { CategoryTreeNode } from '#shared/types/api'
import { snapshotCategoryTree } from './categoryTree'

function node(overrides: Partial<CategoryTreeNode> = {}): CategoryTreeNode {
  return {
    id: 1,
    name: 'Node',
    slug: 'node',
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

// Electronics > [ Phones > [Audio], Laptops ]
function fixture(): CategoryTreeNode[] {
  return [node({
    id: 1,
    name: 'Electronics',
    slug: 'electronics',
    children: [
      node({
        id: 2,
        name: 'Phones',
        slug: 'phones',
        parent_id: 1,
        children: [node({ id: 3, name: 'Audio', slug: 'audio', parent_id: 2 })],
      }),
      node({ id: 4, name: 'Laptops', slug: 'laptops', parent_id: 1 }),
    ],
  })]
}

describe('snapshotCategoryTree', () => {
  it('is stable for structurally identical trees', () => {
    expect(snapshotCategoryTree(fixture())).toBe(snapshotCategoryTree(fixture()))
  })

  // The exact F8 case: a move that keeps the root id list ([1]) unchanged.
  it('changes when a node moves between parents (root ids unchanged)', () => {
    const before = snapshotCategoryTree(fixture())
    const after = fixture()
    const electronics = after[0]!
    const laptops = electronics.children!.find(c => c.id === 4)!
    electronics.children = electronics.children!.filter(c => c.id !== 4)
    const phones = electronics.children!.find(c => c.id === 2)!
    phones.children = [...(phones.children ?? []), { ...laptops, parent_id: 2 }]
    expect(snapshotCategoryTree(after)).not.toBe(before)
  })

  it('changes when sibling order changes', () => {
    const before = snapshotCategoryTree(fixture())
    const after = fixture()
    after[0]!.children = [...after[0]!.children!].reverse()
    expect(snapshotCategoryTree(after)).not.toBe(before)
  })

  it('changes on a rename', () => {
    const before = snapshotCategoryTree(fixture())
    const after = fixture()
    after[0]!.children!.find(c => c.id === 2)!.name = 'Mobiles'
    expect(snapshotCategoryTree(after)).not.toBe(before)
  })

  it('changes on an is_active toggle', () => {
    const before = snapshotCategoryTree(fixture())
    const after = fixture()
    after[0]!.is_active = false
    expect(snapshotCategoryTree(after)).not.toBe(before)
  })

  it('changes when a product_count shifts', () => {
    const before = snapshotCategoryTree(fixture())
    const after = fixture()
    after[0]!.children!.find(c => c.id === 2)!.product_count = 5
    expect(snapshotCategoryTree(after)).not.toBe(before)
  })
})
