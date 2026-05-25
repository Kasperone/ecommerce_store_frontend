<script setup lang="ts">
import { useDragAndDrop } from '@formkit/drag-and-drop/vue'
import type { CategoryTreeNode } from '#shared/types/api'
import { snapshotCategoryTree } from '#shared/utils/categoryTree'

/**
 * Recursive tree node for the admin categories page.
 *
 * Renders one row plus its expandable children list. Each level wires its
 * own `@formkit/drag-and-drop` sortable so sibling reorder is local — the
 * page-level list handles the root level, this component handles every
 * other level. Cross-parent moves go through "Move under…" dialog (drag
 * UX across nested lists is fiddly; not worth the bug surface for v1).
 *
 * Reorder events bubble up with the affected parent_id so the page can
 * convert them into a single bulk-reorder payload.
 */
const props = defineProps<{
  node: CategoryTreeNode
  depth: number
  expandedIds: Set<number>
  /**
   * When true the drag handle is inert (the visible list is a filtered, partial
   * view, so reordering it would corrupt sort_order against hidden siblings).
   */
  reorderDisabled?: boolean
}>()

const emit = defineEmits<{
  toggleExpand: [id: number]
  edit: [node: CategoryTreeNode]
  move: [node: CategoryTreeNode]
  delete: [node: CategoryTreeNode]
  reorder: [{ parentId: number, orderedIds: number[] }]
}>()

const { t } = useI18n()

const hasChildren = computed(() => (props.node.children?.length ?? 0) > 0)
const expanded = computed(() => props.expandedIds.has(props.node.id))

const productCountLabel = computed(() =>
  t(
    'admin.categories.tree.productBadge',
    { count: props.node.product_count, default: `${props.node.product_count}` },
  ),
)

const initialChildren = computed<CategoryTreeNode[]>(() => props.node.children ?? [])

const [childrenListRef, localChildren] = useDragAndDrop<CategoryTreeNode>(
  [...initialChildren.value],
  {
    dragEffectAllowed: 'move',
    dragDropEffect: 'move',
    dragHandle: '.handle',
    onSort: handleSort,
  },
)

watch(
  () => props.node.children ?? [],
  (incoming) => {
    // Deep compare so a change to a grandchild (which keeps this node's direct
    // child id list unchanged) still re-syncs the local drag list.
    if (snapshotCategoryTree(incoming) === snapshotCategoryTree(localChildren.value)) return
    localChildren.value = [...incoming]
  },
)

function handleSort(data: {
  previousValues: CategoryTreeNode[]
  values: CategoryTreeNode[]
}) {
  if (props.reorderDisabled) return
  const previousIds = data.previousValues.map(n => n.id)
  const nextIds = data.values.map(n => n.id)
  if (previousIds.join(',') === nextIds.join(',')) return
  emit('reorder', { parentId: props.node.id, orderedIds: nextIds })
}

function onToggle() {
  if (hasChildren.value) emit('toggleExpand', props.node.id)
}
</script>

<template>
  <li
    class="border border-default rounded-md bg-default"
    :data-category-id="node.id"
    :data-depth="depth"
  >
    <div
      class="flex items-center gap-2 px-3 py-2"
      :style="{ paddingLeft: `${depth * 1.25 + 0.75}rem` }"
    >
      <UButton
        v-if="hasChildren"
        color="neutral"
        variant="ghost"
        size="xs"
        :icon="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        :aria-label="expanded
          ? t('admin.categories.tree.collapse', { default: 'Collapse' })
          : t('admin.categories.tree.expand', { default: 'Expand' })"
        :aria-expanded="expanded"
        @click="onToggle"
      />
      <span
        v-else
        class="w-6 inline-block"
        aria-hidden="true"
      />

      <UIcon
        name="i-lucide-grip-vertical"
        :class="['text-muted', reorderDisabled
          ? 'opacity-30 cursor-not-allowed'
          : 'cursor-grab handle']"
        aria-hidden="true"
      />

      <div class="flex-1 min-w-0 flex items-baseline gap-2">
        <span class="font-medium truncate">{{ node.name }}</span>
        <span class="text-muted text-xs truncate">/{{ node.slug }}</span>
      </div>

      <UBadge
        color="neutral"
        variant="subtle"
        size="sm"
        :title="t('admin.categories.tree.productBadgeTitle', {
          count: node.product_count,
          default: 'Active products directly on this category',
        })"
      >
        {{ productCountLabel }}
      </UBadge>
      <UBadge
        v-if="!node.is_active"
        color="warning"
        variant="subtle"
        size="sm"
      >
        {{ t('admin.categories.tree.inactiveBadge', { default: 'Inactive' }) }}
      </UBadge>

      <div class="flex gap-1">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-pencil"
          :aria-label="t('admin.categories.actions.edit')"
          @click="emit('edit', node)"
        />
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-folder-input"
          :aria-label="t('admin.categories.tree.moveUnder', { default: 'Move under…' })"
          @click="emit('move', node)"
        />
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-trash-2"
          :aria-label="t('admin.categories.actions.delete')"
          @click="emit('delete', node)"
        />
      </div>
    </div>

    <ul
      v-if="hasChildren && expanded"
      ref="childrenListRef"
      class="border-t border-default flex flex-col gap-1 px-2 py-2"
      data-children-list
    >
      <AdminCategoryTreeNode
        v-for="child in localChildren"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :expanded-ids="expandedIds"
        :reorder-disabled="reorderDisabled"
        @toggle-expand="(id) => emit('toggleExpand', id)"
        @edit="(n) => emit('edit', n)"
        @move="(n) => emit('move', n)"
        @delete="(n) => emit('delete', n)"
        @reorder="(payload) => emit('reorder', payload)"
      />
    </ul>
  </li>
</template>
