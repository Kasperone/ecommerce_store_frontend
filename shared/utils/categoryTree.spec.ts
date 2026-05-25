import { describe, expect, it } from 'vitest'
import type { CategoryTreeNode } from '#shared/types/api'
import { filterCategoryTree, snapshotCategoryTree } from './categoryTree'

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

describe('filterCategoryTree', () => {
  // Returns the array unchanged (same reference) when nothing to filter — the
  // page relies on this so an unfiltered tree skips the rebuild work.
  it('returns the input untouched with no search and active=all', () => {
    const input = fixture()
    expect(filterCategoryTree(input, {})).toBe(input)
    expect(filterCategoryTree(input, { search: '  ', active: 'all' })).toBe(input)
  })

  it('keeps matching nodes plus their ancestors (search)', () => {
    const result = filterCategoryTree(fixture(), { search: 'audio' })
    // Electronics > Phones > Audio survives; Laptops (no match) is dropped.
    expect(result).toHaveLength(1)
    const electronics = result[0]!
    expect(electronics.children).toHaveLength(1)
    const phones = electronics.children![0]!
    expect(phones.name).toBe('Phones')
    expect(phones.children!.map(c => c.name)).toEqual(['Audio'])
  })

  it('matches on slug case-insensitively', () => {
    const result = filterCategoryTree(fixture(), { search: 'LAPTOPS' })
    expect(result[0]!.children!.map(c => c.slug)).toEqual(['laptops'])
  })

  // F3: an active child of an inactive parent must stay visible (nested under
  // the inactive parent, which is retained purely as context).
  it('keeps an active child of an inactive parent under active=true', () => {
    const tree = fixture()
    const electronics = tree[0]!
    electronics.is_active = false // deactivate the root
    const result = filterCategoryTree(tree, { active: 'true' })

    expect(result).toHaveLength(1)
    const root = result[0]!
    expect(root.name).toBe('Electronics')
    expect(root.is_active).toBe(false) // shown as a container, flag intact
    // Its active descendants remain reachable in their real position.
    expect(root.children!.map(c => c.name).sort()).toEqual(['Laptops', 'Phones'])
  })

  it('drops a leaf that fails the active filter', () => {
    const tree = fixture()
    tree[0]!.children!.find(c => c.id === 4)!.is_active = false // Laptops inactive
    const result = filterCategoryTree(tree, { active: 'true' })
    expect(result[0]!.children!.map(c => c.name)).toEqual(['Phones'])
  })

  it('shows only inactive rows under active=false', () => {
    const tree = fixture()
    tree[0]!.children!.find(c => c.id === 4)!.is_active = false // Laptops inactive
    const result = filterCategoryTree(tree, { active: 'false' })
    // Electronics is active but kept as an ancestor of the inactive Laptops.
    expect(result[0]!.children!.map(c => c.name)).toEqual(['Laptops'])
  })

  it('combines search and active with AND on the node itself', () => {
    const tree = fixture()
    tree[0]!.children!.find(c => c.id === 2)!.is_active = false // Phones inactive
    // search hits Phones + Audio subtree; active=true rejects Phones itself but
    // Audio (active) keeps Phones visible as an ancestor.
    const result = filterCategoryTree(tree, { search: 'phones', active: 'true' })
    expect(result).toHaveLength(0) // "phones" doesn't match Audio's name/slug
  })
})
