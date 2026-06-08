<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { localizedProductName } from '#shared/utils/localizedProduct'
import { parseProblem } from '#shared/utils/problemDetails'

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const slug = route.params.slug as string

const { data: collection, error } = await useCollectionDetail(slug)
if (error.value) {
  throw createError({
    statusCode: parseProblem(error.value)?.status ?? 404,
    statusMessage: t('collection.loadError'),
    fatal: true,
  })
}

const isPl = computed(() => locale.value === 'pl')
const title = computed(() => {
  const c = collection.value
  if (!c) return ''
  return (isPl.value ? c.name_pl : c.name) || c.name
})
const description = computed(() => {
  const c = collection.value
  if (!c) return ''
  return (isPl.value ? c.description_pl : c.description) || c.description || ''
})

useSeoMeta({
  title: () => {
    const c = collection.value
    return ((isPl.value ? c?.meta_title_pl : c?.meta_title) || c?.meta_title || title.value) ?? ''
  },
  description: () => {
    const c = collection.value
    return ((isPl.value ? c?.meta_description_pl : c?.meta_description) || c?.meta_description || description.value) ?? ''
  },
  ogTitle: () => title.value,
  ogDescription: () => {
    const c = collection.value
    return ((isPl.value ? c?.meta_description_pl : c?.meta_description) || c?.meta_description || description.value) ?? ''
  },
  // Real R2 hero photo (SEO blueprint D9); the site-wide static share image
  // (app.vue) covers hero-less collections.
  ogImage: () => collection.value?.hero_image_url ?? undefined,
  ogImageAlt: () => collection.value?.hero_image_alt ?? title.value,
})

// Member products, in curation order (backend joins on collection_products and
// orders by `position` when `collection_id` is set). Distinct cache key so it
// never collides with the main /products listing or a category page.
const params = computed(() => ({ collectionId: collection.value?.id }))
const { data: listing } = useProductListing(params, `storefront-collection-${slug}-products`)
const items = computed(() => listing.value?.items ?? [])

// Structured data (SEO blueprint SEO-1.3): type the auto WebPage node as a
// CollectionPage + an ItemList of the visible products, mirroring the category
// page. The module absolutizes Breadcrumb `item` URLs but NOT plain ItemList
// `url`s — qualify them from the canonical site origin.
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
  defineBreadcrumb({
    itemListElement: () => [
      { name: t('collection.index.title'), item: localePath('/collections') },
      { name: title.value },
    ],
  }),
])
</script>

<template>
  <NuxtLayout>
    <div
      v-if="collection"
      class="mx-auto w-full max-w-7xl space-y-6 px-4 py-8"
    >
      <!-- Breadcrumb: Collections → current. -->
      <nav class="flex flex-wrap items-center gap-2 text-sm text-muted">
        <NuxtLink
          :to="localePath('/collections')"
          class="hover:text-primary"
        >
          {{ t('collection.index.title') }}
        </NuxtLink>
        <span>/</span>
        <span class="font-medium text-highlighted">{{ title }}</span>
      </nav>

      <div
        v-if="collection.hero_image_url"
        class="relative overflow-hidden rounded-xl"
      >
        <img
          :src="collection.hero_image_url"
          :alt="collection.hero_image_alt ?? title"
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

      <ShopProductGrid
        v-if="items.length"
        :products="items"
      />

      <p
        v-else
        class="py-12 text-center text-muted"
      >
        {{ t('collection.empty') }}
      </p>
    </div>
  </NuxtLayout>
</template>
