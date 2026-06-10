<script setup lang="ts">
import { z } from 'zod'
import { useDebounceFn } from '@vueuse/core'
import { useDragAndDrop } from '@formkit/drag-and-drop/vue'
import type {
  CategoryResponse,
  CategoryTreeNode,
  CategoryWithProductCount,
} from '#shared/types/api'
import { parseProblem } from '#shared/utils/problemDetails'
import { filterCategoryTree, snapshotCategoryTree } from '#shared/utils/categoryTree'

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

// `useUrlFilters` returns `undefined` for an absent query param (the schema
// marks it optional), so the `{ active: 'all' }` default never lands on first
// load. Coalesce to 'all' here — otherwise `undefined` falls through to the
// `=== 'true'` branch below as `false`, the tree fetches inactive-only, and the
// admin sees an empty page until they manually pick a filter.
const activeFilter = computed(() => filters.value.active ?? 'all')

// Always fetch the full tree; both the search box and the active/inactive
// selector filter client-side via `filterCategoryTree`. This keeps the two
// filters consistent (ancestor-preserving) and fixes the server-side
// is_active filter dropping active children of inactive parents (F3).
const { data: tree, error: listError } = useCategoryTreeQuery()

const treeData = computed<CategoryTreeNode[]>(() => tree.value ?? [])

const visibleTree = computed<CategoryTreeNode[]>(() =>
  filterCategoryTree(treeData.value, {
    search: filters.value.search,
    active: activeFilter.value,
  }),
)

// Any active filter hides siblings, so the visible list is a partial view of
// each level — reordering it would renumber sort_order over the subset and
// collide with the hidden siblings. Disable drag-reorder while filtered (F5).
const isFiltered = computed(
  () => !!filters.value.search?.trim() || activeFilter.value !== 'all',
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

watch(
  visibleTree,
  (incoming) => {
    // Deep structural compare (not just root ids) so a cross-parent move,
    // rename, or is_active toggle — which can leave the root id list unchanged
    // — still re-syncs the drag list instead of rendering stale until reload.
    if (snapshotCategoryTree(incoming) === snapshotCategoryTree(rootList.value)) return
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
  // Belt-and-suspenders: the drag handle is also hidden while filtered, but
  // guard here too so a stray sort event can't renumber a partial list.
  if (isFiltered.value) return
  const prev = data.previousValues.map(n => n.id).join(',')
  const next = data.values.map(n => n.id).join(',')
  if (prev === next) return
  void pushReorder(null, data.values.map(n => n.id))
}

function onChildReorder(payload: { parentId: number, orderedIds: number[] }) {
  if (isFiltered.value) return
  void pushReorder(payload.parentId, payload.orderedIds)
}

// Mutation modal state.
const creating = ref(false)
const editing = ref<CategoryResponse | CategoryWithProductCount | CategoryTreeNode | null>(null)
const moving = ref<CategoryTreeNode | null>(null)
const deleting = ref<CategoryTreeNode | null>(null)
const modalError = ref<unknown>(null)

const createMutation = useCreateCategory()
const updateMutation = useUpdateCategory()
const deleteMutation = useDeleteCategory()
const deleteWithModeMutation = useDeleteCategoryWithMode()
const uploadHeroMutation = useUploadCategoryHero()
const updateHeroAltMutation = useUpdateCategoryHeroAlt()
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
  google_product_category: string | null
  heroFile: File | null
  heroAlt: string
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
    google_product_category: payload.google_product_category,
  }
}

async function uploadHeroIfStaged(
  id: number,
  heroFile: File | null,
  heroAlt: string,
): Promise<void> {
  if (!heroFile) return
  const formData = new FormData()
  formData.append('file', heroFile)
  await uploadHeroMutation.mutateAsync({ id, formData })
  // Upload sets the file; alt is a separate PATCH (mirrors the products
  // gallery). Only send it when the admin actually typed something.
  if (heroAlt) {
    await updateHeroAltMutation.mutateAsync({ id, patch: { hero_image_alt: heroAlt } })
  }
}

async function onCreate(payload: CategoryFormSubmit) {
  modalError.value = null
  let createdId: number | null = null
  try {
    const body = buildPatchPayload(payload)
    const created = await createMutation.mutateAsync(body)
    createdId = created.id
    await uploadHeroIfStaged(created.id, payload.heroFile, payload.heroAlt)
    creating.value = false
  }
  catch (err) {
    modalError.value = err
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
  // Hero fields live on CategoryResponse; a tree node may not carry them.
  const existing = editing.value as Partial<CategoryResponse>
  const existingAlt = existing.hero_image_alt ?? ''
  const hasExistingHero = Boolean(existing.hero_image_url)
  modalError.value = null
  try {
    await updateMutation.mutateAsync({ id, patch: buildPatchPayload(payload) })
    if (payload.removeExistingHero && !payload.heroFile) {
      await deleteHeroMutation.mutateAsync(id)
    }
    await uploadHeroIfStaged(id, payload.heroFile, payload.heroAlt)
    // No new file and not removing: persist an alt-only edit on the existing
    // hero (the PATCH /hero metadata path). uploadHeroIfStaged already covers
    // the alt for a freshly uploaded file.
    if (
      !payload.heroFile
      && !payload.removeExistingHero
      && hasExistingHero
      && payload.heroAlt !== existingAlt
    ) {
      await updateHeroAltMutation.mutateAsync({
        id,
        patch: { hero_image_alt: payload.heroAlt || null },
      })
    }
    editing.value = null
  }
  catch (err) {
    modalError.value = err
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
    modalError.value = err
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
    modalError.value = err
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
          :model-value="activeFilter"
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
        <template v-if="filters.search || activeFilter !== 'all'">
          {{ $t('admin.categories.empty.noResults') }}
        </template>
        <template v-else>
          {{ $t('admin.categories.empty.noCategories') }}
        </template>
      </div>

      <template v-else>
        <p
          v-if="isFiltered"
          class="text-muted text-xs"
        >
          {{ $t('admin.categories.tree.reorderDisabledHint') }}
        </p>

        <ul
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
            :reorder-disabled="isFiltered"
            @toggle-expand="toggleExpand"
            @edit="(n) => { editing = n; modalError = null }"
            @move="(n) => { moving = n; modalError = null }"
            @delete="(n) => { deleting = n; modalError = null }"
            @reorder="onChildReorder"
          />
        </ul>
      </template>

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
        :error="modalError"
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
