<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { localizedCategoryName } from '#shared/utils/categoryTree'
import { localizedProductDescription, localizedProductName } from '#shared/utils/localizedProduct'
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

const displayName = computed(() =>
  product.value ? localizedProductName(product.value, locale.value) : '',
)
const displayDescription = computed(() =>
  product.value ? localizedProductDescription(product.value, locale.value) : null,
)

useSeoMeta({
  title: () => displayName.value,
  description: () => displayDescription.value ?? '',
  ogTitle: () => displayName.value,
  ogDescription: () => displayDescription.value ?? '',
})

// A backorderable product at zero stock is "on backorder", not "out of stock".
const backorder = computed(
  () => (product.value?.stock ?? 0) <= 0 && product.value?.allow_backorder === true,
)
const outOfStock = computed(
  () => (product.value?.stock ?? 0) <= 0 && !backorder.value,
)
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
        <span class="font-medium text-highlighted">{{ displayName }}</span>
      </nav>

      <div class="grid gap-8 lg:grid-cols-2">
        <ShopProductGallery
          :images="product.images"
          :name="displayName"
        />

        <div class="flex flex-col gap-4">
          <h1 class="text-3xl font-bold">
            {{ displayName }}
          </h1>

          <div>
            <ShopPriceDisplay
              :product="product"
              size="lg"
            />
            <ShopOmnibusPrice :product="product" />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              v-if="outOfStock"
              color="neutral"
              variant="subtle"
            >
              {{ t('stock.outOfStock') }}
            </UBadge>
            <UBadge
              v-else-if="backorder"
              color="info"
              variant="subtle"
            >
              {{ t('stock.backorder') }}
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
            v-if="displayDescription"
            class="mt-4"
          >
            <h2 class="mb-2 text-lg font-semibold">
              {{ t('details.description') }}
            </h2>
            <p class="whitespace-pre-line text-muted">
              {{ displayDescription }}
            </p>
          </div>
        </div>
      </div>

      <ShopProductReviews :product-id="product.id" />
    </div>
  </NuxtLayout>
</template>
