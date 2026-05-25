<script setup lang="ts">
import { z } from 'zod'
import { useDebounceFn } from '@vueuse/core'
import { useDragAndDrop } from '@formkit/drag-and-drop/vue'
import type {
  CategoryResponse,
  CategoryTreeNode,
  CategoryWithProductCount,
} from '#shared/types/api'
import type { ProblemDetails } from '#shared/utils/problemDetails'
import { parseProblem } from '#shared/utils/problemDetails'

definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})

const { t } = useI18n()
useHead({ title: () => t('admin.categories.title') })

// URL-state filters.
const filterSchema = z.object({
  active: z.enum(['all', 'true', 'false']).optional(),
  search: z.string().optional(),
})

const { filters, set } = useUrlFilters(
  filterSchema,
  { active: 'all' as const, search: undefined as string | undefined },
)

const searchInput = ref(filters.value.search ?? '')
const debouncedSetSearch = useDebounceFn((value: string) => {
  set({ search: value || undefined })
}, 300)
watch(searchInput, value => debouncedSetSearch(value))

const treeParams = computed(() => ({
  isActive: filters.value.active === 'all' ? undefined : filters.value.active === 'true',
}))

const { data: tree, error: listError } = useCategoryTreeQuery(treeParams)

const treeData = computed<CategoryTreeNode[]>(() => tree.value ?? [])

// Search filter walks the tree client-side, hiding subtrees that contain no
// match (a parent with a matching descendant stays visible).
function matches(node: CategoryTreeNode, q: string): boolean {
  if (!q) return true
  const haystack = `${node.name.toLowerCase()} ${node.slug.toLowerCase()}`
  if (haystack.includes(q)) return true
  return (node.children ?? []).some(c => matches(c, q))
}

function filterTree(nodes: CategoryTreeNode[], q: string): CategoryTreeNode[] {
  if (!q) return nodes
  return nodes
    .filter(n => matches(n, q))
    .map(n => ({ ...n, children: filterTree(n.children ?? [], q) }))
}

const visibleTree = computed<CategoryTreeNode[]>(() =>
  filterTree(treeData.value, filters.value.search?.toLowerCase().trim() ?? ''),
)

// Expand/collapse state — start with all top-level nodes expanded so the
// admin sees the first depth without an extra click. Deeper levels stay
// collapsed by default.
const expandedIds = ref<Set<number>>(new Set())
watch(
  treeData,
  (incoming) => {
    if (expandedIds.value.size > 0) return
    expandedIds.value = new Set(incoming.map(n => n.id))
  },
  { immediate: true },
)

function toggleExpand(id: number) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

// Root-level drag-and-drop. Children handle their own list via CategoryTreeNode.
const [rootListRef, rootList] = useDragAndDrop<CategoryTreeNode>(
  [],
  {
    dragEffectAllowed: 'move',
    dragDropEffect: 'move',
    dragHandle: '.handle',
    onSort: handleRootSort,
  },
)

function snapshotIds(list: CategoryTreeNode[]) {
  return list.map(n => n.id).join(',')
}

watch(
  visibleTree,
  (incoming) => {
    if (snapshotIds(incoming) === snapshotIds(rootList.value)) return
    rootList.value = [...incoming]
  },
  { immediate: true },
)

const bulkReorderMutation = useBulkReorderCategories()

async function pushReorder(
  parentId: number | null,
  orderedIds: number[],
) {
  if (orderedIds.length === 0) return
  await bulkReorderMutation.mutateAsync({
    items: orderedIds.map((id, idx) => ({ id, parent_id: parentId, sort_order: idx })),
  })
}

function handleRootSort(data: {
  previousValues: CategoryTreeNode[]
  values: CategoryTreeNode[]
}) {
  const prev = data.previousValues.map(n => n.id).join(',')
  const next = data.values.map(n => n.id).join(',')
  if (prev === next) return
  void pushReorder(null, data.values.map(n => n.id))
}

function onChildReorder(payload: { parentId: number, orderedIds: number[] }) {
  void pushReorder(payload.parentId, payload.orderedIds)
}

// Mutation modal state.
const creating = ref(false)
const editing = ref<CategoryResponse | CategoryWithProductCount | CategoryTreeNode | null>(null)
const moving = ref<CategoryTreeNode | null>(null)
const deleting = ref<CategoryTreeNode | null>(null)
const modalError = ref<ProblemDetails | null>(null)

const createMutation = useCreateCategory()
const updateMutation = useUpdateCategory()
const deleteMutation = useDeleteCategory()
const deleteWithModeMutation = useDeleteCategoryWithMode()
const uploadHeroMutation = useUploadCategoryHero()
const deleteHeroMutation = useDeleteCategoryHero()

const deletePreviewQuery = useCategoryDeletePreviewQuery(() => deleting.value?.id)

interface CategoryFormSubmit {
  name: string
  slug: string
  description: string | null
  is_active: boolean
  name_pl: string | null
  slug_pl: string | null
  description_pl: string | null
  meta_title: string | null
  meta_description: string | null
  meta_title_pl: string | null
  meta_description_pl: string | null
  heroFile: File | null
  removeExistingHero: boolean
}

function buildPatchPayload(payload: CategoryFormSubmit) {
  // Everything goes in the patch; nullable fields are emitted as null when the
  // admin clears them so the backend persists the intent.
  return {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
    is_active: payload.is_active,
    name_pl: payload.name_pl,
    slug_pl: payload.slug_pl,
    description_pl: payload.description_pl,
    meta_title: payload.meta_title,
    meta_description: payload.meta_description,
    meta_title_pl: payload.meta_title_pl,
    meta_description_pl: payload.meta_description_pl,
  }
}

async function uploadHeroIfStaged(
  id: number,
  heroFile: File | null,
): Promise<void> {
  if (!heroFile) return
  const formData = new FormData()
  formData.append('file', heroFile)
  await uploadHeroMutation.mutateAsync({ id, formData })
}

async function onCreate(payload: CategoryFormSubmit) {
  modalError.value = null
  let createdId: number | null = null
  try {
    const body = buildPatchPayload(payload)
    const created = await createMutation.mutateAsync(body)
    createdId = created.id
    await uploadHeroIfStaged(created.id, payload.heroFile)
    creating.value = false
  }
  catch (err) {
    modalError.value = parseProblem(err)
    // If the row landed but the hero upload failed, compensate by
    // deleting the orphan category. Best-effort: a failure here is logged
    // but doesn't replace the original error surfaced to the admin.
    if (createdId !== null) {
      try {
        await deleteMutation.mutateAsync(createdId)
      }
      catch {
        // Swallow — the user already sees the original error.
      }
    }
  }
}

async function onUpdate(payload: CategoryFormSubmit) {
  if (!editing.value) return
  const id = editing.value.id
  modalError.value = null
  try {
    await updateMutation.mutateAsync({ id, patch: buildPatchPayload(payload) })
    if (payload.removeExistingHero && !payload.heroFile) {
      await deleteHeroMutation.mutateAsync(id)
    }
    await uploadHeroIfStaged(id, payload.heroFile)
    editing.value = null
  }
  catch (err) {
    modalError.value = parseProblem(err)
  }
}

async function onMoveConfirm(payload: { id: number, parentId: number | null }) {
  modalError.value = null
  try {
    await updateMutation.mutateAsync({
      id: payload.id,
      patch: { parent_id: payload.parentId },
    })
    moving.value = null
  }
  catch (err) {
    modalError.value = parseProblem(err)
  }
}

async function onDelete(payload: { id: number, mode: 'none' | 'cascade' | 'reparent_to_root' }) {
  modalError.value = null
  try {
    if (payload.mode === 'none') {
      await deleteMutation.mutateAsync(payload.id)
    }
    else {
      await deleteWithModeMutation.mutateAsync({ id: payload.id, mode: payload.mode })
    }
    deleting.value = null
  }
  catch (err) {
    modalError.value = parseProblem(err)
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="space-y-6">
      <header class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold">
            {{ $t('admin.categories.title') }}
          </h1>
          <p class="text-muted text-sm mt-1">
            {{ $t('admin.categories.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="creating = true; modalError = null"
        >
          {{ $t('admin.categories.actions.create') }}
        </UButton>
      </header>

      <div class="flex flex-wrap items-center gap-3">
        <USelectMenu
          :model-value="filters.active"
          :items="[
            { label: $t('admin.categories.filters.activeAll'), value: 'all' },
            { label: $t('admin.categories.filters.activeOnly'), value: 'true' },
            { label: $t('admin.categories.filters.inactiveOnly'), value: 'false' },
          ]"
          value-key="value"
          class="w-56"
          @update:model-value="(v) => set({ active: v as 'all' | 'true' | 'false' })"
        />
        <UInput
          v-model="searchInput"
          icon="i-lucide-search"
          :placeholder="$t('admin.categories.placeholders.search')"
          class="flex-1 min-w-64"
        />
      </div>

      <ErrorAlert
        v-if="listError"
        :problem="parseProblem(listError)"
      />
      <ErrorAlert
        v-if="bulkReorderMutation.error.value"
        :problem="parseProblem(bulkReorderMutation.error.value)"
      />

      <div
        v-if="visibleTree.length === 0"
        class="text-muted text-sm py-12 text-center"
      >
        <template v-if="filters.search || filters.active !== 'all'">
          {{ $t('admin.categories.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.categories.empty.noCategories') }}
        </template>
      </div>

      <ul
        v-else
        ref="rootListRef"
        class="flex flex-col gap-2"
        data-root-list
      >
        <AdminCategoryTreeNode
          v-for="node in rootList"
          :key="node.id"
          :node="node"
          :depth="0"
          :expanded-ids="expandedIds"
          @toggle-expand="toggleExpand"
          @edit="(n) => { editing = n; modalError = null }"
          @move="(n) => { moving = n; modalError = null }"
          @delete="(n) => { deleting = n; modalError = null }"
          @reorder="onChildReorder"
        />
      </ul>

      <AdminCategoryFormModal
        :open="creating"
        :category="null"
        :loading="createMutation.isLoading.value"
        :error="modalError"
        @update:open="(v) => { creating = v; if (!v) modalError = null }"
        @submit="onCreate"
        @cancel="creating = false"
      />

      <AdminCategoryFormModal
        :open="editing !== null"
        :category="editing"
        :loading="updateMutation.isLoading.value"
        :error="modalError"
        @update:open="(v) => { if (!v) editing = null; modalError = null }"
        @submit="onUpdate"
        @cancel="editing = null"
      />

      <AdminCategoryMoveDialog
        :open="moving !== null"
        :node="moving"
        :tree="treeData"
        :loading="updateMutation.isLoading.value"
        @update:open="(v) => { if (!v) moving = null; modalError = null }"
        @confirm="onMoveConfirm"
        @cancel="moving = null"
      />

      <AdminCategoryDeleteConfirm
        :open="deleting !== null"
        :category="deleting"
        :preview="deletePreviewQuery.data.value ?? null"
        :loading="deleteMutation.isLoading.value || deleteWithModeMutation.isLoading.value"
        :error="modalError"
        @update:open="(v) => { if (!v) deleting = null; modalError = null }"
        @confirm="onDelete"
        @cancel="deleting = null"
      />
    </div>
  </NuxtLayout>
</template>
