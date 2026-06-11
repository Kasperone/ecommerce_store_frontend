<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { findCategoryNode, findCategoryPath, localizedCategoryName } from '#shared/utils/categoryTree'
import { localizedProductName } from '#shared/utils/localizedProduct'
import { parseProblem } from '#shared/utils/problemDetails'

const { t, locale } = useI18n()
const route = useRoute()
const slug = route.params.slug as string

const { data: category, error } = await useCategoryDetail(slug)
if (error.value) {
  throw createError({
    statusCode: parseProblem(error.value)?.status ?? 404,
    statusMessage: t('category.loadError'),
    fatal: true,
  })
}

const isPl = computed(() => locale.value === 'pl')
const title = computed(() => (category.value ? localizedCategoryName(category.value, locale.value) : ''))
const description = computed(() => {
  const c = category.value
  if (!c) return ''
  return (isPl.value ? c.description_pl : c.description) || c.description || ''
})

useSeoMeta({
  title: () => {
    const c = category.value
    return ((isPl.value ? c?.meta_title_pl : c?.meta_title) || c?.meta_title || title.value) ?? ''
  },
  description: () => {
    const c = category.value
    return ((isPl.value ? c?.meta_description_pl : c?.meta_description) || c?.meta_description || description.value) ?? ''
  },
  ogTitle: () => title.value,
  ogDescription: () => {
    const c = category.value
    return ((isPl.value ? c?.meta_description_pl : c?.meta_description) || c?.meta_description || description.value) ?? ''
  },
  // Real R2 hero photo (SEO blueprint D9); the site-wide static share image
  // (app.vue) covers hero-less categories.
  ogImage: () => category.value?.hero_image_url ?? undefined,
  ogImageAlt: () => category.value?.hero_image_alt ?? title.value,
})

// Products in this category — distinct cache key so it never collides with the
// main /products listing.
const params = computed(() => ({ categoryId: category.value?.id, sort: 'newest' as const }))
const { data: listing } = useProductListing(params, `storefront-category-${slug}-products`)
const items = computed(() => listing.value?.items ?? [])

// GA4 view_item_list for the category listing (client-only + consent-guarded).
const { viewItemList } = useEcommerceTracking()
watch(items, (list) => {
  if (list.length) {
    viewItemList(list, { id: `category_${category.value?.id ?? slug}`, name: title.value || slug })
  }
}, { immediate: true })

// Subcategories — products on a parent category live on its children, so surface
// them as links rather than dead-ending on an empty grid.
const localePath = useLocalePath()
const { data: tree } = useStorefrontCategories()
const subcategories = computed(() => {
  if (!category.value) return []
  return findCategoryNode(tree.value ?? [], category.value.id)?.children ?? []
})

// Ancestor chain (root → current) for the breadcrumb UI + BreadcrumbList.
const breadcrumbPath = computed(() => {
  if (!category.value) return []
  return findCategoryPath(tree.value ?? [], category.value.id)
})

// ---------------------------------------------------------------------------
// Structured data (SEO blueprint SEO-1.3 / D6): type the auto WebPage node as
// CollectionPage + an ItemList of the visible products — Google's Carousels
// beta covers Shopping category pages in all EEA countries (PL qualifies).
// SSR-only; ItemList mirrors the first listing page actually rendered below.
// ---------------------------------------------------------------------------
// The module absolutizes Breadcrumb `item` URLs but NOT plain ItemList `url`s
// (verified) — qualify them from the canonical site origin.
const { url: siteUrl } = useSiteConfig()

useSchemaOrg([
  defineWebPage({ '@type': 'CollectionPage' }),
  defineItemList({
    itemListElement: () =>
      items.value.map((p, i) => ({
        '@type': 'ListItem',
        'position': i + 1,
        'name': localizedProductName(p, locale.value),
        ...(p.images?.[0]?.url ? { image: p.images[0].url } : {}),
        'url': `${siteUrl}${localePath(`/products/${p.slug}`)}`,
      })),
  }),
  // Mirrors the visible breadcrumb nav (last item carries no `item`).
  defineBreadcrumb({
    itemListElement: () => [
      { name: t('navigation.products'), item: localePath('/products') },
      ...breadcrumbPath.value.slice(0, -1).map(node => ({
        name: localizedCategoryName(node, locale.value),
        item: localePath(`/category/${node.slug}`),
      })),
      { name: title.value },
    ],
  }),
])
</script>

<template>
  <NuxtLayout>
    <div
      v-if="category"
      class="mx-auto w-full max-w-2560px space-y-6 px-4 py-8"
    >
      <!-- Breadcrumb (PDP pattern): Products → ancestors → current. -->
      <nav class="flex flex-wrap items-center gap-2 text-sm text-muted">
        <NuxtLink
          :to="localePath('/products')"
          class="hover:text-primary"
        >
          {{ t('navigation.products') }}
        </NuxtLink>
        <template
          v-for="node in breadcrumbPath.slice(0, -1)"
          :key="node.id"
        >
          <span>/</span>
          <NuxtLink
            :to="localePath(`/category/${node.slug}`)"
            class="hover:text-primary"
          >
            {{ localizedCategoryName(node, locale) }}
          </NuxtLink>
        </template>
        <span>/</span>
        <span class="font-medium text-highlighted">{{ title }}</span>
      </nav>

      <div
        v-if="category.hero_image_url"
        class="relative overflow-hidden rounded-xl"
      >
        <img
          :src="category.hero_image_url"
          :alt="category.hero_image_alt ?? title"
          class="h-48 w-full object-cover sm:h-64"
        >
        <div
          :class="[
            'absolute inset-0 flex items-end p-6',
            'bg-gradient-to-t from-black/60 to-transparent',
          ]"
        >
          <h1 class="text-3xl font-bold text-white">
            {{ title }}
          </h1>
        </div>
      </div>
      <h1
        v-else
        class="text-2xl font-bold"
      >
        {{ title }}
      </h1>

      <p
        v-if="description"
        class="max-w-2xl text-muted"
      >
        {{ description }}
      </p>

      <div
        v-if="subcategories.length"
        class="flex flex-wrap gap-2"
      >
        <ULink
          v-for="sub in subcategories"
          :key="sub.id"
          :to="localePath(`/category/${sub.slug}`)"
          :class="[
            'rounded-full border border-gray-200 px-4 py-1.5 text-sm',
            'hover:border-primary hover:text-primary dark:border-gray-800',
          ]"
        >
          {{ localizedCategoryName(sub, locale) }}
        </ULink>
      </div>

      <ShopProductGrid
        v-if="items.length"
        :products="items"
      />

      <p
        v-if="!items.length && !subcategories.length"
        class="py-12 text-center text-muted"
      >
        {{ t('category.empty') }}
      </p>
    </div>
  </NuxtLayout>
</template>
