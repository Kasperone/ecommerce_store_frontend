<script setup lang="ts">
import type { CategoryTreeNode } from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'

/**
 * "Move under…" picker dialog.
 *
 * Cross-parent reparenting goes through this dialog because dragging across
 * nested `@formkit/drag-and-drop` lists is fiddly. The eligible-parent list
 * is the flattened tree minus the moving node itself and its descendants
 * (those would form a cycle).
 *
 * "Root" is offered as an explicit option (parent_id = null) so the admin
 * can lift a subtree out without juggling the parent selector.
 */
const props = defineProps<{
  open: boolean
  node: CategoryTreeNode | null
  tree: CategoryTreeNode[]
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': [{ id: number, parentId: number | null }]
  'cancel': []
}>()

const { t } = useI18n()

interface FlatOption {
  id: number
  name: string
  depth: number
}

function flatten(nodes: CategoryTreeNode[], depth = 0): FlatOption[] {
  const out: FlatOption[] = []
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth })
    if (n.children?.length) out.push(...flatten(n.children, depth + 1))
  }
  return out
}

function descendantIds(node: CategoryTreeNode): Set<number> {
  const ids = new Set<number>()
  const walk = (n: CategoryTreeNode) => {
    ids.add(n.id)
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return ids
}

const flat = computed(() => flatten(props.tree))

const eligibleParents = computed(() => {
  if (!props.node) return flat.value
  const blocked = descendantIds(props.node)
  return flat.value.filter(o => !blocked.has(o.id))
})

const selectedParentId = ref<number | 'root' | null>(null)

watch(
  () => [props.open, props.node?.id] as const,
  ([open]) => {
    if (open) {
      // Default to current parent so a no-op close doesn't visually flip
      // the selection. ``null`` parent → "root".
      selectedParentId.value = props.node?.parent_id ?? 'root'
    }
  },
  { immediate: true },
)

const isUnchanged = computed(() => {
  if (!props.node) return true
  const currentParent = props.node.parent_id ?? 'root'
  return selectedParentId.value === currentParent
})

function onConfirm() {
  if (!props.node || isUnchanged.value) return
  const parentId = selectedParentId.value === 'root' ? null : selectedParentId.value
  emit('confirm', { id: props.node.id, parentId })
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('admin.categories.tree.moveDialog.title', {
      default: 'Move under…',
    })"
    :description="node?.name ?? ''"
    :dismissible="!loading"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <ErrorAlert
          v-if="error"
          :problem="error"
        />
        <p class="text-sm text-muted">
          {{ t('admin.categories.tree.moveDialog.body', {
            default: 'Pick the new parent. Descendants of the moving category are filtered out.',
          }) }}
        </p>
        <URadioGroup
          v-model="selectedParentId"
          :items="[
            {
              value: 'root' as const,
              label: t('admin.categories.tree.moveDialog.rootLabel', { default: 'Root (no parent)' }),
            },
            ...eligibleParents.map(o => ({
              value: o.id,
              label: `${'— '.repeat(o.depth)}${o.name}`,
            })),
          ]"
          value-key="value"
        />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          color="neutral"
          variant="soft"
          :disabled="loading"
          @click="emit('cancel'); emit('update:open', false)"
        >
          {{ t('admin.categories.actions.cancel', { default: 'Cancel' }) }}
        </UButton>
        <UButton
          color="primary"
          :loading="loading"
          :disabled="isUnchanged"
          @click="onConfirm"
        >
          {{ t('admin.categories.tree.moveDialog.confirm', { default: 'Move' }) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
