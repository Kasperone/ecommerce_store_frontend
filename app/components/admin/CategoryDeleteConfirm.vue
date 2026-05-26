<script setup lang="ts">
import type { ProblemDetails } from '#shared/utils/problemDetails'
import type {
  CategoryDeletePreview,
  CategoryTreeNode,
  CategoryWithProductCount,
} from '#shared/types/api'

/**
 * Cascade-or-reparent delete confirmation.
 *
 * Modes mirror the backend `?mode=` query param:
 *  - `none` (default): plain delete. Only enabled when the row is a leaf
 *    with zero direct products.
 *  - `cascade`: recursive delete. Disabled when the subtree carries any
 *    active products (the backend rejects this too — surfaced here for
 *    a cleaner UX than a 400 round-trip).
 *  - `reparent_to_root`: direct children lifted to root, then row deleted.
 *    Disabled when direct products are present (products are never
 *    silently reparented; admin must clear them first).
 *
 * Counts come from `GET /categories/{id}/delete-preview` via the
 * `preview` prop. Until that lands the component falls back to the
 * `product_count` on the legacy `category` shape so it remains usable
 * with a flat list.
 */
type DeleteMode = 'none' | 'cascade' | 'reparent_to_root'

const props = defineProps<{
  open: boolean
  category: CategoryTreeNode | CategoryWithProductCount | null
  preview?: CategoryDeletePreview | null
  loading?: boolean
  error?: ProblemDetails | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': [{ id: number, mode: DeleteMode }]
  'cancel': []
}>()

const { t } = useI18n()

const deleteTitle = computed(
  () => props.category?.name
    ?? t('admin.categories.confirm.deleteTitle', { default: 'Delete category' }),
)

const directProductCount = computed(() =>
  props.preview?.direct_product_count
  ?? (props.category as CategoryWithProductCount | null)?.product_count
  ?? 0,
)
const subtreeProductCount = computed(() =>
  props.preview?.subtree_product_count ?? directProductCount.value,
)
const descendantCount = computed(() => props.preview?.descendant_count ?? 0)

const hasChildren = computed(() => descendantCount.value > 0)
const hasDirectProducts = computed(() => directProductCount.value > 0)
const subtreeHasProducts = computed(() => subtreeProductCount.value > 0)
const isLeafWithNoProducts = computed(() => !hasChildren.value && !hasDirectProducts.value)

const mode = ref<DeleteMode>('none')

watch(
  () => [props.open, props.category?.id, props.preview] as const,
  ([open]) => {
    if (!open) return
    // Open with the safest default — plain delete if it's a leaf; cascade
    // when there are descendants but no subtree products; otherwise force
    // the admin to read and pick.
    if (isLeafWithNoProducts.value) mode.value = 'none'
    else if (hasChildren.value && !subtreeHasProducts.value) mode.value = 'cascade'
    else mode.value = 'reparent_to_root'
  },
  { immediate: true },
)

const modeDisabled = computed(() => ({
  none: hasChildren.value || hasDirectProducts.value,
  cascade: !hasChildren.value || subtreeHasProducts.value,
  reparent_to_root: !hasChildren.value || hasDirectProducts.value,
}))

const items = computed(() => [
  {
    value: 'none' as DeleteMode,
    label: t('admin.categories.confirm.modes.none', { default: 'Delete (leaf only)' }),
    description: t('admin.categories.confirm.modes.noneHint', {
      default: 'Only available when this category has no children and no products.',
    }),
    disabled: modeDisabled.value.none,
  },
  {
    value: 'cascade' as DeleteMode,
    label: t('admin.categories.confirm.modes.cascade', {
      count: descendantCount.value,
      default: `Delete subtree (+${descendantCount.value} descendants)`,
    }),
    description: t('admin.categories.confirm.modes.cascadeHint', {
      default: 'Recursively delete this category and every descendant. Products in the subtree must be removed first.',
    }),
    disabled: modeDisabled.value.cascade,
  },
  {
    value: 'reparent_to_root' as DeleteMode,
    label: t('admin.categories.confirm.modes.reparent', {
      default: 'Move children to root, then delete',
    }),
    description: t('admin.categories.confirm.modes.reparentHint', {
      default: 'Direct children become roots. Products on this category must be removed first; products are never silently re-parented.',
    }),
    disabled: modeDisabled.value.reparent_to_root,
  },
])

const confirmDisabled = computed(() => {
  if (props.loading) return true
  if (!props.category) return true
  // Block confirm when the currently selected mode is disabled — e.g.
  // a leaf with products would have `none` and `reparent_to_root` both
  // disabled and the admin must clear products first.
  if (mode.value === 'none' && modeDisabled.value.none) return true
  if (mode.value === 'cascade' && modeDisabled.value.cascade) return true
  if (mode.value === 'reparent_to_root' && modeDisabled.value.reparent_to_root) return true
  return false
})

const helpLine = computed(() => {
  if (hasDirectProducts.value && hasChildren.value) {
    return t('admin.categories.confirm.helpProductsAndChildren', {
      count: directProductCount.value,
      default: `${directProductCount.value} products are attached directly. Remove them before deleting.`,
    })
  }
  if (hasDirectProducts.value) {
    return t('admin.categories.confirm.helpDirectProducts', {
      count: directProductCount.value,
      default: `${directProductCount.value} products are attached directly. Reassign them first.`,
    })
  }
  if (hasChildren.value && subtreeHasProducts.value) {
    return t('admin.categories.confirm.helpSubtreeProducts', {
      count: subtreeProductCount.value,
      default: `${subtreeProductCount.value} products live in the subtree. Reassign them before cascading.`,
    })
  }
  if (hasChildren.value) {
    return t('admin.categories.confirm.helpChildrenOnly', {
      count: descendantCount.value,
      default: `${descendantCount.value} child categories exist. Pick a mode.`,
    })
  }
  return t('admin.categories.confirm.deleteBodyEmpty', {
    default: 'This category will be permanently removed.',
  })
})

function onConfirm() {
  if (!props.category) return
  if (confirmDisabled.value) return
  emit('confirm', { id: props.category.id, mode: mode.value })
}
</script>

<template>
  <UModal
    :open="open"
    :title="deleteTitle"
    :dismissible="!loading"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <p class="text-sm">
          {{ helpLine }}
        </p>
        <!--
          The cascade label embeds `descendantCount`, which is 0 until
          /delete-preview resolves. Reka snapshots each radio's accessible
          name at registration, so a label that changes from "+0" to "+N"
          after mount leaves the a11y name stale at "+0". Key the group on the
          count (+ category id) so it remounts and re-registers with the
          correct name once the preview lands.
        -->
        <URadioGroup
          :key="`${category?.id ?? 'none'}-${descendantCount}`"
          v-model="mode"
          :items="items"
          value-key="value"
          :ui="{ wrapper: 'flex flex-col gap-2' }"
        />
        <ErrorAlert
          v-if="error"
          :problem="error"
          class="mt-1"
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
          color="error"
          :loading="loading"
          :disabled="confirmDisabled"
          @click="onConfirm"
        >
          {{ t('admin.categories.actions.delete', { default: 'Delete' }) }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
