<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { localizedCategoryName } from '#shared/utils/categoryTree'
import { parseProblem } from '#shared/utils/problemDetails'

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const slug = route.params.slug as string

const { data: product, error } = await useProductDetail(slug)

// A missing slug (or any fetch failure) becomes a proper error page rather than
// an empty shell — 404 for not-found, the upstream status otherwise.
if (error.value) {
  throw createError({
    statusCode: parseProblem(error.value)?.status ?? 404,
    statusMessage: t('pdp.loadError'),
    fatal: true,
  })
}

useSeoMeta({
  title: () => product.value?.name ?? '',
  description: () => product.value?.description ?? '',
  ogTitle: () => product.value?.name ?? '',
  ogDescription: () => product.value?.description ?? '',
})

const outOfStock = computed(() => (product.value?.stock ?? 0) <= 0)
const lowStock = computed(() => {
  const p = product.value
  if (!p || p.stock <= 0 || p.low_stock_threshold == null) return false
  return p.stock <= p.low_stock_threshold
})

const category = computed(() => product.value?.category ?? null)
const categoryTo = computed(() =>
  category.value ? localePath(`/category/${category.value.slug}`) : null,
)
</script>

<template>
  <NuxtLayout>
    <div
      v-if="product"
      class="mx-auto w-full max-w-7xl px-4 py-8"
    >
      <nav class="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <NuxtLink
          :to="localePath('/products')"
          class="hover:text-primary"
        >
          {{ t('navigation.products') }}
        </NuxtLink>
        <template v-if="category && categoryTo">
          <span>/</span>
          <NuxtLink
            :to="categoryTo"
            class="hover:text-primary"
          >
            {{ localizedCategoryName(category, locale) }}
          </NuxtLink>
        </template>
        <span>/</span>
        <span class="font-medium text-highlighted">{{ product.name }}</span>
      </nav>

      <div class="grid gap-8 lg:grid-cols-2">
        <ShopProductGallery
          :images="product.images"
          :name="product.name"
        />

        <div class="flex flex-col gap-4">
          <h1 class="text-3xl font-bold">
            {{ product.name }}
          </h1>

          <ShopPriceDisplay
            :product="product"
            size="lg"
          />

          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              v-if="outOfStock"
              color="neutral"
              variant="subtle"
            >
              {{ t('stock.outOfStock') }}
            </UBadge>
            <UBadge
              v-else-if="lowStock"
              color="warning"
              variant="subtle"
            >
              {{ t('stock.lowStock', { count: product.stock }) }}
            </UBadge>
            <UBadge
              v-else
              color="success"
              variant="subtle"
            >
              {{ t('stock.inStock') }}
            </UBadge>
            <span
              v-if="product.sku"
              class="text-sm text-muted"
            >{{ t('details.sku') }}: {{ product.sku }}</span>
          </div>

          <div class="max-w-md">
            <ShopAddToCartButton
              :product="product"
              block
            />
          </div>

          <div
            v-if="product.description"
            class="mt-4"
          >
            <h2 class="mb-2 text-lg font-semibold">
              {{ t('details.description') }}
            </h2>
            <p class="whitespace-pre-line text-muted">
              {{ product.description }}
            </p>
          </div>
        </div>
      </div>

      <ShopProductReviews :product-id="product.id" />
    </div>
  </NuxtLayout>
</template>
