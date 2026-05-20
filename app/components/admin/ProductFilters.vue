<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { CategoryResponse } from '#shared/types/api'

export type TriState = 'all' | 'true' | 'false'

export interface ProductFilterValues {
  active: TriState
  featured: TriState
  inStock: TriState
  categoryId?: number
  minPrice?: number
  maxPrice?: number
  search?: string
}

const props = defineProps<{
  values: ProductFilterValues
  categories: CategoryResponse[]
}>()

const emit = defineEmits<{
  'update:filters': [patch: Partial<ProductFilterValues>]
  'reset': []
}>()

const { t } = useI18n()

// Search is debounced; everything else updates immediately.
const searchInput = ref(props.values.search ?? '')
watch(
  () => props.values.search,
  (incoming) => {
    if ((incoming ?? '') !== searchInput.value) {
      searchInput.value = incoming ?? ''
    }
  },
)
const debouncedSearch = useDebounceFn((v: string) => {
  emit('update:filters', { search: v.trim() || undefined })
}, 300)
watch(searchInput, value => debouncedSearch(value))

const statusItems = computed(() => [
  { label: t('admin.products.filters.activeAll'), value: 'all' as TriState },
  { label: t('admin.products.filters.activeOnly'), value: 'true' as TriState },
  { label: t('admin.products.filters.inactiveOnly'), value: 'false' as TriState },
])

const featuredItems = computed(() => [
  { label: t('admin.products.filters.featuredAll'), value: 'all' as TriState },
  { label: t('admin.products.filters.featuredOnly'), value: 'true' as TriState },
  { label: t('admin.products.filters.notFeatured'), value: 'false' as TriState },
])

const stockItems = computed(() => [
  { label: t('admin.products.filters.stockAll'), value: 'all' as TriState },
  { label: t('admin.products.filters.inStockOnly'), value: 'true' as TriState },
  { label: t('admin.products.filters.outOfStockOnly'), value: 'false' as TriState },
])

// USelectMenu wants every option to have a defined value; we represent
// "any category" with a sentinel 0 and translate to undefined on emit.
const ANY_CATEGORY = 0
const categoryItems = computed(() => [
  { label: t('admin.products.filters.categoryAll'), value: ANY_CATEGORY },
  ...props.categories.map(c => ({ label: c.name, value: c.id })),
])

const categoryValue = computed(() => props.values.categoryId ?? ANY_CATEGORY)

function onCategoryChange(v: number) {
  emit('update:filters', { categoryId: v === ANY_CATEGORY ? undefined : v })
}

function onPriceChange(field: 'minPrice' | 'maxPrice', v: number | null | undefined) {
  emit('update:filters', { [field]: typeof v === 'number' ? v : undefined })
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-3">
    <UFormField
      :label="t('admin.products.filters.statusLabel')"
      class="w-44"
    >
      <USelectMenu
        :model-value="values.active"
        :items="statusItems"
        value-key="value"
        class="w-full"
        @update:model-value="(v) => emit('update:filters', { active: v as TriState })"
      />
    </UFormField>

    <UFormField
      :label="t('admin.products.filters.featuredLabel')"
      class="w-44"
    >
      <USelectMenu
        :model-value="values.featured"
        :items="featuredItems"
        value-key="value"
        class="w-full"
        @update:model-value="(v) => emit('update:filters', { featured: v as TriState })"
      />
    </UFormField>

    <UFormField
      :label="t('admin.products.filters.stockLabel')"
      class="w-44"
    >
      <USelectMenu
        :model-value="values.inStock"
        :items="stockItems"
        value-key="value"
        class="w-full"
        @update:model-value="(v) => emit('update:filters', { inStock: v as TriState })"
      />
    </UFormField>

    <UFormField
      :label="t('admin.products.filters.categoryLabel')"
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
      :label="t('admin.products.filters.minPrice')"
      class="w-36"
    >
      <UInputNumber
        :model-value="values.minPrice"
        :min="0"
        :step="0.01"
        class="w-full"
        @update:model-value="(v) => onPriceChange('minPrice', v)"
      />
    </UFormField>

    <UFormField
      :label="t('admin.products.filters.maxPrice')"
      class="w-36"
    >
      <UInputNumber
        :model-value="values.maxPrice"
        :min="0"
        :step="0.01"
        class="w-full"
        @update:model-value="(v) => onPriceChange('maxPrice', v)"
      />
    </UFormField>

    <UFormField class="flex-1 min-w-64">
      <UInput
        v-model="searchInput"
        icon="i-lucide-search"
        :placeholder="t('admin.products.filters.searchPlaceholder')"
        class="w-full"
      />
    </UFormField>

    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-x"
      @click="emit('reset')"
    >
      {{ t('admin.products.filters.reset') }}
    </UButton>
  </div>
</template>
