<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import type { CatalogSort } from '~/composables/catalog/useCatalog'

export interface CatalogFilterValues {
  search?: string
  categoryId?: number
  inStock?: boolean
  sort: CatalogSort
}

const props = defineProps<{
  values: CatalogFilterValues
  categories: { id: number, name: string }[]
}>()

const emit = defineEmits<{
  'update:filters': [patch: Partial<CatalogFilterValues>]
  'reset': []
}>()

const { t } = useI18n()

// Search is debounced; selects update immediately (mirrors AdminProductFilters).
const searchInput = ref(props.values.search ?? '')
watch(
  () => props.values.search,
  (incoming) => {
    if ((incoming ?? '') !== searchInput.value) searchInput.value = incoming ?? ''
  },
)
const debouncedSearch = useDebounceFn((v: string) => {
  emit('update:filters', { search: v.trim() || undefined })
}, 300)
watch(searchInput, value => debouncedSearch(value))

// USelectMenu wants a defined value per option; "any category" is sentinel 0.
const ANY_CATEGORY = 0
const categoryItems = computed(() => [
  { label: t('catalog.allCategories'), value: ANY_CATEGORY },
  ...props.categories.map(c => ({ label: c.name, value: c.id })),
])
const categoryValue = computed(() => props.values.categoryId ?? ANY_CATEGORY)
function onCategoryChange(v: number) {
  emit('update:filters', { categoryId: v === ANY_CATEGORY ? undefined : v })
}

const sortItems = computed(() => [
  { label: t('catalog.sort.newest'), value: 'newest' as CatalogSort },
  { label: t('catalog.sort.priceAsc'), value: 'priceAsc' as CatalogSort },
  { label: t('catalog.sort.priceDesc'), value: 'priceDesc' as CatalogSort },
  { label: t('catalog.sort.nameAsc'), value: 'nameAsc' as CatalogSort },
])

const inStockModel = computed({
  get: () => props.values.inStock ?? false,
  set: (v: boolean) => emit('update:filters', { inStock: v || undefined }),
})
</script>

<template>
  <div class="flex flex-wrap items-end gap-3">
    <UFormField
      :label="t('catalog.categoryLabel')"
      class="w-56"
    >
      <USelectMenu
        :model-value="categoryValue"
        :items="categoryItems"
        value-key="value"
        searchable
        class="w-full"
        @update:model-value="(v) => onCategoryChange(v as number)"
      />
    </UFormField>

    <UFormField
      :label="t('catalog.sortBy')"
      class="w-52"
    >
      <USelectMenu
        :model-value="values.sort"
        :items="sortItems"
        value-key="value"
        class="w-full"
        @update:model-value="(v) => emit('update:filters', { sort: v as CatalogSort })"
      />
    </UFormField>

    <UFormField class="flex-1 min-w-64">
      <UInput
        v-model="searchInput"
        icon="i-lucide-search"
        :placeholder="t('catalog.searchPlaceholder')"
        class="w-full"
      />
    </UFormField>

    <div class="pb-2">
      <UCheckbox
        v-model="inStockModel"
        :label="t('catalog.inStockOnly')"
      />
    </div>

    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-x"
      @click="emit('reset')"
    >
      {{ t('catalog.clearAll') }}
    </UButton>
  </div>
</template>
