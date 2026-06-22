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

// Search is debounced; selects update immediately.
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

// Price applies on an explicit "Apply" (button or Enter), not per keystroke —
// live-filtering a number range as you type is jittery. The inputs are held in
// local state and committed together; everything else stays live.
function normPrice(v: number | null | undefined): number | undefined {
  return typeof v === 'number' ? v : undefined
}
const localMin = ref<number | null | undefined>(props.values.minPrice)
const localMax = ref<number | null | undefined>(props.values.maxPrice)
watch(
  () => [props.values.minPrice, props.values.maxPrice] as const,
  ([min, max]) => {
    localMin.value = min
    localMax.value = max
  },
)
const priceDirty = computed(() =>
  normPrice(localMin.value) !== props.values.minPrice
  || normPrice(localMax.value) !== props.values.maxPrice,
)
function applyPrice() {
  if (!priceDirty.value) return
  emit('update:filters', {
    minPrice: normPrice(localMin.value),
    maxPrice: normPrice(localMax.value),
  })
}
</script>

<template>
  <div class="space-y-3">
    <!-- Dropdown filters — even grid so nothing wraps raggedly. -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <UFormField :label="t('admin.products.filters.statusLabel')">
        <USelectMenu
          :model-value="values.active"
          :items="statusItems"
          value-key="value"
          class="w-full"
          @update:model-value="(v) => emit('update:filters', { active: v as TriState })"
        />
      </UFormField>

      <UFormField :label="t('admin.products.filters.featuredLabel')">
        <USelectMenu
          :model-value="values.featured"
          :items="featuredItems"
          value-key="value"
          class="w-full"
          @update:model-value="(v) => emit('update:filters', { featured: v as TriState })"
        />
      </UFormField>

      <UFormField :label="t('admin.products.filters.stockLabel')">
        <USelectMenu
          :model-value="values.inStock"
          :items="stockItems"
          value-key="value"
          class="w-full"
          @update:model-value="(v) => emit('update:filters', { inStock: v as TriState })"
        />
      </UFormField>

      <UFormField :label="t('admin.products.filters.categoryLabel')">
        <USelectMenu
          :model-value="categoryValue"
          :items="categoryItems"
          value-key="value"
          searchable
          class="w-full"
          @update:model-value="(v) => onCategoryChange(v as number)"
        />
      </UFormField>
    </div>

    <!-- Price range (explicit Apply) + search + reset. -->
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex items-end gap-2">
        <UFormField
          :label="t('admin.products.filters.minPrice')"
          class="w-32"
        >
          <UInputNumber
            v-model="localMin"
            :min="0"
            :step="0.01"
            class="w-full"
            @keydown.enter="applyPrice"
          />
        </UFormField>
        <UFormField
          :label="t('admin.products.filters.maxPrice')"
          class="w-32"
        >
          <UInputNumber
            v-model="localMax"
            :min="0"
            :step="0.01"
            class="w-full"
            @keydown.enter="applyPrice"
          />
        </UFormField>
        <UButton
          color="neutral"
          variant="subtle"
          icon="i-lucide-filter"
          :disabled="!priceDirty"
          @click="applyPrice"
        >
          {{ t('admin.products.filters.apply') }}
        </UButton>
      </div>

      <UFormField class="flex-1 min-w-56">
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
  </div>
</template>
