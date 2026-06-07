<script setup lang="ts">
import { computed } from 'vue'
import { z } from 'zod'
import { useI18n } from 'vue-i18n'
import { flattenCategoryTree } from '#shared/utils/categoryTree'
import { localizedProductName } from '#shared/utils/localizedProduct'
import { parseProblem } from '#shared/utils/problemDetails'
import type { CatalogFilterValues } from '~/components/shop/CatalogToolbar.vue'
import type { CatalogSort } from '~/composables/catalog/useCatalog'

const { t, locale } = useI18n()
const localePath = useLocalePath()

useHead({ title: () => t('catalog.title') })
useSeoMeta({
  title: () => t('catalog.title'),
  description: () => t('catalog.metaDescription'),
})

const filterSchema = z.object({
  search: z.string().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  inStock: z.boolean().optional(),
  sort: z.enum(['newest', 'priceAsc', 'priceDesc', 'nameAsc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
})

const defaults = {
  search: undefined as string | undefined,
  categoryId: undefined as number | undefined,
  inStock: false,
  sort: 'newest' as CatalogSort,
  page: 1,
}

const { filters, set, reset } = useUrlFilters(filterSchema, defaults)

const listParams = computed(() => ({
  page: filters.value.page ?? 1,
  categoryId: filters.value.categoryId,
  search: filters.value.search,
  inStock: filters.value.inStock,
  sort: (filters.value.sort ?? 'newest') as CatalogSort,
}))

const { data: listing, error, status } = useProductListing(listParams)
const { data: categoryTree } = useStorefrontCategories()

// Flatten the tree to indented {id,name} options for the toolbar select.
const categoryOptions = computed(() =>
  flattenCategoryTree(categoryTree.value ?? [], locale.value).map(c => ({
    id: c.id,
    name: `${'— '.repeat(c.depth)}${c.name}`,
  })),
)

const filterValues = computed<CatalogFilterValues>(() => ({
  search: filters.value.search,
  categoryId: filters.value.categoryId,
  inStock: filters.value.inStock,
  sort: (filters.value.sort ?? 'newest') as CatalogSort,
}))

function onFiltersUpdate(patch: Partial<CatalogFilterValues>) {
  // Any filter change resets to page 1.
  set({ ...patch, page: 1 })
}

const items = computed(() => listing.value?.items ?? [])
const total = computed(() => listing.value?.total ?? 0)
const pageSize = computed(() => listing.value?.page_size ?? STOREFRONT_PAGE_SIZE)
const currentPage = computed(() => listing.value?.page ?? 1)

// Structured data (SEO blueprint SEO-1.3): ItemList over the visible listing
// page. SSR-only — for a cookie-less crawler this is the deterministic
// first-page listing (filtered/sorted variants canonicalize to the clean
// listing anyway, D3). Plain ItemList `url`s aren't absolutized by the module
// (verified) — qualify them from the canonical site origin.
const { url: siteUrl } = useSiteConfig()
useSchemaOrg([
  defineItemList({
    itemListElement: () =>
      items.value.map((p, i) => ({
        '@type': 'ListItem',
        'position': (currentPage.value - 1) * pageSize.value + i + 1,
        'name': localizedProductName(p, locale.value),
        ...(p.images?.[0]?.url ? { image: p.images[0].url } : {}),
        'url': `${siteUrl}${localePath(`/products/${p.slug}`)}`,
      })),
  }),
])
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
      <h1 class="text-2xl font-bold">
        {{ t('catalog.title') }}
      </h1>

      <ShopCatalogToolbar
        :values="filterValues"
        :categories="categoryOptions"
        @update:filters="onFiltersUpdate"
        @reset="reset()"
      />

      <ErrorAlert
        v-if="error"
        :problem="parseProblem(error)"
      />

      <div
        v-else-if="status === 'pending' && items.length === 0"
        class="py-12 text-center text-muted"
      >
        {{ t('actions.loading') }}
      </div>

      <p
        v-else-if="items.length === 0"
        class="py-12 text-center text-muted"
      >
        {{ t('catalog.empty') }}
      </p>

      <template v-else>
        <ShopProductGrid :products="items" />

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
  </NuxtLayout>
</template>
