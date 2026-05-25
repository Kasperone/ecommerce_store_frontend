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
