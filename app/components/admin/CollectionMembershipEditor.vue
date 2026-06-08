<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { ProductWithCategory } from '#shared/types/api'

/**
 * Ordered product-membership editor for a collection.
 *
 * The model is the ordered list of member products (id + name). The editor
 * supports:
 *  - **add** via a debounced product search (excludes already-selected rows);
 *  - **reorder** with up/down controls — array order IS the curation order;
 *  - **remove**.
 *
 * The parent persists by PUTting the ordered `product_ids` to
 * `PUT /admin/collections/{id}/products` — `position` is written by array
 * index. The editor itself issues no writes (the page owns the save).
 */

export interface MemberRow {
  id: number
  name: string
}

const model = defineModel<MemberRow[]>({ default: () => [] })

defineProps<{ disabled?: boolean }>()

const searchTerm = ref('')
const debouncedTerm = ref('')

const setDebounced = useDebounceFn((value: string) => {
  debouncedTerm.value = value
}, 300)
watch(searchTerm, value => setDebounced(value))

// Search the catalog only once the admin has typed something — keeps the
// dropdown empty (and the query idle) on first open.
const searchEnabled = computed(() => debouncedTerm.value.trim().length > 0)
const { data: searchResults, isLoading: searching } = useProductsQuery(() => ({
  search: debouncedTerm.value.trim() || undefined,
  pageSize: 10,
  page: 1,
}))

const selectedIds = computed(() => new Set(model.value.map(m => m.id)))

const candidates = computed<ProductWithCategory[]>(() => {
  if (!searchEnabled.value) return []
  return (searchResults.value?.items ?? []).filter(p => !selectedIds.value.has(p.id))
})

function add(product: ProductWithCategory) {
  if (selectedIds.value.has(product.id)) return
  model.value = [...model.value, { id: product.id, name: product.name }]
  searchTerm.value = ''
  debouncedTerm.value = ''
}

function remove(id: number) {
  model.value = model.value.filter(m => m.id !== id)
}

function move(index: number, delta: number) {
  const next = index + delta
  if (next < 0 || next >= model.value.length) return
  const copy = [...model.value]
  const [row] = copy.splice(index, 1)
  if (!row) return
  copy.splice(next, 0, row)
  model.value = copy
}
</script>

<template>
  <div class="space-y-4">
    <!-- Search + add -->
    <div class="space-y-2">
      <UInput
        v-model="searchTerm"
        icon="i-lucide-search"
        :placeholder="$t('admin.collections.membership.searchPlaceholder')"
        :aria-label="$t('admin.collections.membership.searchPlaceholder')"
        :disabled="disabled"
        class="w-full"
        data-membership-search
      />
      <div
        v-if="searchEnabled"
        class="border border-default rounded-md divide-y divide-default max-h-56 overflow-y-auto"
        data-membership-results
      >
        <div
          v-if="searching"
          class="text-muted text-sm py-3 text-center"
        >
          {{ $t('admin.collections.membership.searching') }}
        </div>
        <p
          v-else-if="candidates.length === 0"
          class="text-muted text-sm py-3 px-3"
        >
          {{ $t('admin.collections.membership.noResults') }}
        </p>
        <button
          v-for="product in candidates"
          v-else
          :key="product.id"
          type="button"
          class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-elevated disabled:opacity-50"
          :disabled="disabled"
          @click="add(product)"
        >
          <span class="truncate">{{ product.name }}</span>
          <UIcon
            name="i-lucide-plus"
            class="size-4 shrink-0 text-muted"
          />
        </button>
      </div>
    </div>

    <!-- Ordered membership -->
    <div>
      <p class="text-muted text-xs uppercase tracking-wide mb-1.5">
        {{ $t('admin.collections.membership.selected', { count: model.length }, model.length) }}
      </p>
      <p
        v-if="model.length === 0"
        class="text-muted text-sm py-3"
      >
        {{ $t('admin.collections.membership.empty') }}
      </p>
      <ul
        v-else
        class="border border-default rounded-md divide-y divide-default"
        data-membership-list
      >
        <li
          v-for="(row, index) in model"
          :key="row.id"
          class="flex items-center gap-2 px-3 py-2"
        >
          <span class="text-muted text-xs w-6 shrink-0">{{ index + 1 }}</span>
          <span class="flex-1 truncate text-sm">{{ row.name }}</span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-chevron-up"
            :aria-label="$t('admin.collections.membership.moveUp')"
            :disabled="disabled || index === 0"
            @click="move(index, -1)"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-chevron-down"
            :aria-label="$t('admin.collections.membership.moveDown')"
            :disabled="disabled || index === model.length - 1"
            @click="move(index, 1)"
          />
          <UButton
            size="xs"
            color="error"
            variant="ghost"
            icon="i-lucide-x"
            :aria-label="$t('admin.collections.membership.remove')"
            :disabled="disabled"
            @click="remove(row.id)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>
