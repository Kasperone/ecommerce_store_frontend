<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { findCategoryNode, localizedCategoryName } from '#shared/utils/categoryTree'
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
})

// Products in this category — distinct cache key so it never collides with the
// main /products listing.
const params = computed(() => ({ categoryId: category.value?.id, sort: 'newest' as const }))
const { data: listing } = useProductListing(params, `storefront-category-${slug}-products`)
const items = computed(() => listing.value?.items ?? [])

// Subcategories — products on a parent category live on its children, so surface
// them as links rather than dead-ending on an empty grid.
const localePath = useLocalePath()
const { data: tree } = useStorefrontCategories()
const subcategories = computed(() => {
  if (!category.value) return []
  return findCategoryNode(tree.value ?? [], category.value.id)?.children ?? []
})
</script>

<template>
  <NuxtLayout>
    <div
      v-if="category"
      class="mx-auto w-full max-w-7xl space-y-6 px-4 py-8"
    >
      <div
        v-if="category.hero_image_url"
        class="relative overflow-hidden rounded-xl"
      >
        <img
          :src="category.hero_image_url"
          :alt="category.hero_image_alt ?? title"
          class="h-48 w-full object-cover sm:h-64"
        >
        <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-6">
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
          class="rounded-full border border-gray-200 px-4 py-1.5 text-sm hover:border-primary hover:text-primary dark:border-gray-800"
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
