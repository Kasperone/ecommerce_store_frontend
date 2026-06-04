<script setup lang="ts">
import { computed } from 'vue'
import { z } from 'zod'
import { useI18n } from 'vue-i18n'
import { parseProblem } from '#shared/utils/problemDetails'
import type { SearchParams, SearchSort } from '~/composables/catalog/useCatalog'

const { t, locale } = useI18n()
const { currency } = useCurrencyPreference()

const filterSchema = z.object({
  q: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  inStock: z.boolean().optional(),
  sort: z.enum(['relevance', 'priceAsc', 'priceDesc', 'nameAsc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
})

const defaults = {
  q: undefined as string | undefined,
  categoryId: undefined as number | undefined,
  minPrice: undefined as number | undefined,
  maxPrice: undefined as number | undefined,
  inStock: false,
  sort: 'relevance' as SearchSort,
  page: 1,
}

const { filters, set } = useUrlFilters(filterSchema, defaults)

const query = computed(() => filters.value.q ?? '')

const searchParams = computed<SearchParams>(() => ({
  q: query.value,
  locale: locale.value,
  currency: currency.value,
  categoryId: filters.value.categoryId,
  minPrice: filters.value.minPrice,
  maxPrice: filters.value.maxPrice,
  inStock: filters.value.inStock,
  sort: (filters.value.sort ?? 'relevance') as SearchSort,
  page: filters.value.page ?? 1,
}))

const { data: results, error, status } = useSearchResults(searchParams)

useHead({ title: () => t('search.results.heading') })
useSeoMeta({
  title: () => t('search.results.heading'),
  // Search-results pages should not be indexed (thin, query-dependent).
  robots: 'noindex, follow',
})

const items = computed(() => results.value?.items ?? [])
const total = computed(() => results.value?.total ?? 0)
const pageSize = computed(() => results.value?.page_size ?? 12)
const currentPage = computed(() => results.value?.page ?? 1)
const categoryFacets = computed(() => results.value?.facets?.category_id ?? [])

const hasActiveFilters = computed(() =>
  filters.value.categoryId != null
  || filters.value.minPrice != null
  || filters.value.maxPrice != null
  || !!filters.value.inStock,
)

const sortOptions = computed(() => [
  { value: 'relevance', label: t('search.sort.relevance') },
  { value: 'priceAsc', label: t('search.sort.priceAsc') },
  { value: 'priceDesc', label: t('search.sort.priceDesc') },
  { value: 'nameAsc', label: t('search.sort.nameAsc') },
])

const sortValue = computed({
  get: () => filters.value.sort ?? 'relevance',
  set: (value: SearchSort) => set({ sort: value, page: 1 }),
})

function onFacetUpdate(patch: Partial<SearchParams>) {
  set({ ...patch, page: 1 })
}

function clearFacets() {
  // Keep the query; clear only the facets.
  set({ categoryId: undefined, minPrice: undefined, maxPrice: undefined, inStock: false, page: 1 })
}
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
      <header class="space-y-1">
        <h1 class="text-2xl font-bold">
          {{ t('search.results.heading') }}
        </h1>
        <p
          v-if="query"
          class="text-muted"
        >
          {{ t('search.results.summary', { count: total, query }, total) }}
        </p>
      </header>

      <ErrorAlert
        v-if="error"
        :problem="parseProblem(error)"
      />

      <div
        v-else
        class="grid gap-8 lg:grid-cols-[16rem_1fr]"
      >
        <ShopSearchFacets
          :category-facets="categoryFacets"
          :category-id="filters.categoryId"
          :min-price="filters.minPrice"
          :max-price="filters.maxPrice"
          :in-stock="filters.inStock"
          :has-active-filters="hasActiveFilters"
          @update="onFacetUpdate"
          @clear="clearFacets"
        />

        <div class="space-y-4">
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm text-muted">
              {{ t('search.results.count', { count: total }, total) }}
            </p>
            <USelect
              v-model="sortValue"
              :items="sortOptions"
              value-key="value"
              size="sm"
              class="w-48"
              :aria-label="t('search.sort.label')"
            />
          </div>

          <div
            v-if="status === 'pending' && items.length === 0"
            class="py-12 text-center text-muted"
          >
            {{ t('actions.loading') }}
          </div>

          <p
            v-else-if="items.length === 0"
            class="py-12 text-center text-muted"
          >
            {{ t('search.noResults', { query }) }}
          </p>

          <template v-else>
            <div class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">
              <ShopSearchResultCard
                v-for="item in items"
                :key="item.id"
                :result="item"
              />
            </div>

            <UPagination
              v-if="total > pageSize"
              :total="total"
              :items-per-page="pageSize"
              :page="currentPage"
              class="flex justify-center"
              @update:page="(p) => set({ page: p })"
            />
          </template>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>
