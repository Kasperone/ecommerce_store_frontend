import type { CategoryTreeNode } from '#shared/types/api'

/**
 * Structural fingerprint of a rendered category tree: every node's id +
 * sibling order + the fields the admin rows display, recursively through
 * `children`.
 *
 * The admin tree's `@formkit/drag-and-drop` lists only re-sync from a fresh
 * query result when this fingerprint changes, so it must capture every change
 * that should re-render: reorder, cross-parent move (which leaves the *root* id
 * list untouched), rename, slug edit, is_active toggle, product-count shift.
 * Comparing root-level ids alone misses the deep ones and leaves the tree
 * rendering stale until a full reload.
 */
export function snapshotCategoryTree(nodes: CategoryTreeNode[]): string {
  const serialise = (node: CategoryTreeNode): unknown => ({
    id: node.id,
    name: node.name,
    slug: node.slug,
    is_active: node.is_active,
    product_count: node.product_count,
    children: (node.children ?? []).map(serialise),
  })
  return JSON.stringify(nodes.map(serialise))
}

export type CategoryActiveFilter = 'all' | 'true' | 'false'

export interface CategoryTreeFilter {
  /** Case-insensitive substring match against name + slug. */
  search?: string
  /** Narrow to active (`'true'`) or inactive (`'false'`) rows; `'all'` keeps both. */
  active?: CategoryActiveFilter
}

/**
 * Filter a category tree, keeping a node when it matches the filter OR any of
 * its descendants do. A matching node therefore stays in its real hierarchy
 * context: an active child under an inactive parent is shown nested under that
 * (still-rendered) parent rather than vanishing or being re-rooted.
 *
 * This is the single client-side filter for both the search box and the
 * active/inactive selector — the two used to diverge (search kept ancestors
 * client-side; `is_active` dropped orphans server-side, hiding active children
 * of inactive parents entirely). The `search` and `active` predicates combine
 * with AND on a node's *own* match; ancestors that match neither but contain a
 * match are retained as context (and carry their `is_active` flag so the
 * inactive badge marks them as containers, not matches).
 */
export function filterCategoryTree(
  nodes: CategoryTreeNode[],
  filter: CategoryTreeFilter,
): CategoryTreeNode[] {
  const q = filter.search?.toLowerCase().trim() ?? ''
  const active = filter.active ?? 'all'
  if (!q && active === 'all') return nodes

  const selfMatches = (node: CategoryTreeNode): boolean => {
    const searchOk
      = !q || `${node.name.toLowerCase()} ${node.slug.toLowerCase()}`.includes(q)
    const activeOk = active === 'all' || node.is_active === (active === 'true')
    return searchOk && activeOk
  }

  const walk = (list: CategoryTreeNode[]): CategoryTreeNode[] => {
    const out: CategoryTreeNode[] = []
    for (const node of list) {
      const children = walk(node.children ?? [])
      if (selfMatches(node) || children.length > 0) {
        out.push({ ...node, children })
      }
    }
    return out
  }

  return walk(nodes)
}
