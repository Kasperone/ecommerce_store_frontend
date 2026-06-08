<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { FacetBucket } from '#shared/types/api'

/**
 * Facet sidebar for `/search`: category buckets (with match counts), an
 * in-stock toggle, and a price range. Emits a partial patch the page merges
 * into its URL filters (which drives the refetch). Price emits on blur so we
 * don't refetch on every keystroke.
 */
const props = defineProps<{
  categoryFacets: FacetBucket[]
  collectionFacets?: FacetBucket[]
  tagFacets?: FacetBucket[]
  categoryId?: number
  collection?: string
  tag?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  hasActiveFilters?: boolean
}>()

const emit = defineEmits<{
  update: [patch: {
    categoryId?: number
    collection?: string
    tag?: string
    minPrice?: number
    maxPrice?: number
    inStock?: boolean
  }]
  clear: []
}>()

const { t } = useI18n()

const localMin = ref<number | undefined>(props.minPrice)
const localMax = ref<number | undefined>(props.maxPrice)

watch(() => props.minPrice, v => (localMin.value = v))
watch(() => props.maxPrice, v => (localMax.value = v))

function toggleCategory(bucketValue: string) {
  const id = Number(bucketValue)
  emit('update', { categoryId: props.categoryId === id ? undefined : id })
}

// Collection/tag buckets carry the slug/name directly in `value` (not an id).
function toggleCollection(bucketValue: string) {
  emit('update', { collection: props.collection === bucketValue ? undefined : bucketValue })
}

function toggleTag(bucketValue: string) {
  emit('update', { tag: props.tag === bucketValue ? undefined : bucketValue })
}

function applyPrice() {
  emit('update', { minPrice: localMin.value ?? undefined, maxPrice: localMax.value ?? undefined })
}

function onInStock(value: boolean) {
  emit('update', { inStock: value })
}
</script>

<template>
  <aside class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold uppercase text-muted">
        {{ t('search.facets.title') }}
      </h2>
      <UButton
        v-if="hasActiveFilters"
        variant="link"
        size="xs"
        class="px-0"
        @click="emit('clear')"
      >
        {{ t('search.facets.clear') }}
      </UButton>
    </div>

    <!-- In stock -->
    <USwitch
      :model-value="inStock ?? false"
      :label="t('search.facets.inStock')"
      @update:model-value="onInStock"
    />

    <!-- Category facet -->
    <div v-if="categoryFacets.length">
      <h3 class="mb-2 text-sm font-medium">
        {{ t('search.facets.category') }}
      </h3>
      <ul class="space-y-1">
        <li
          v-for="bucket in categoryFacets"
          :key="bucket.value"
        >
          <button
            type="button"
            :class="[
              'flex w-full items-center justify-between rounded px-2 py-1 text-sm',
              'hover:bg-elevated',
              Number(bucket.value) === categoryId ? 'bg-elevated font-medium text-primary' : '',
            ]"
            :aria-pressed="Number(bucket.value) === categoryId"
            @click="toggleCategory(bucket.value)"
          >
            <span class="truncate">{{ bucket.label ?? `#${bucket.value}` }}</span>
            <span class="ml-2 shrink-0 text-muted">{{ bucket.count }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Collection facet -->
    <div v-if="collectionFacets?.length">
      <h3 class="mb-2 text-sm font-medium">
        {{ t('search.facets.collection') }}
      </h3>
      <ul class="space-y-1">
        <li
          v-for="bucket in collectionFacets"
          :key="bucket.value"
        >
          <button
            type="button"
            :class="[
              'flex w-full items-center justify-between rounded px-2 py-1 text-sm',
              'hover:bg-elevated',
              bucket.value === collection ? 'bg-elevated font-medium text-primary' : '',
            ]"
            :aria-pressed="bucket.value === collection"
            @click="toggleCollection(bucket.value)"
          >
            <span class="truncate">{{ bucket.label ?? bucket.value }}</span>
            <span class="ml-2 shrink-0 text-muted">{{ bucket.count }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Tag facet -->
    <div v-if="tagFacets?.length">
      <h3 class="mb-2 text-sm font-medium">
        {{ t('search.facets.tag') }}
      </h3>
      <ul class="space-y-1">
        <li
          v-for="bucket in tagFacets"
          :key="bucket.value"
        >
          <button
            type="button"
            :class="[
              'flex w-full items-center justify-between rounded px-2 py-1 text-sm',
              'hover:bg-elevated',
              bucket.value === tag ? 'bg-elevated font-medium text-primary' : '',
            ]"
            :aria-pressed="bucket.value === tag"
            @click="toggleTag(bucket.value)"
          >
            <span class="truncate">{{ bucket.label ?? bucket.value }}</span>
            <span class="ml-2 shrink-0 text-muted">{{ bucket.count }}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- Price range -->
    <div>
      <h3 class="mb-2 text-sm font-medium">
        {{ t('search.facets.price') }}
      </h3>
      <div class="flex items-center gap-2">
        <UInputNumber
          v-model="localMin"
          :min="0"
          :placeholder="t('search.facets.min')"
          :aria-label="t('search.facets.min')"
          class="w-full"
          @blur="applyPrice"
        />
        <span class="text-muted">–</span>
        <UInputNumber
          v-model="localMax"
          :min="0"
          :placeholder="t('search.facets.max')"
          :aria-label="t('search.facets.max')"
          class="w-full"
          @blur="applyPrice"
        />
      </div>
    </div>
  </aside>
</template>
