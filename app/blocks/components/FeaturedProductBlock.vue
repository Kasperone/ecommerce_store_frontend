<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SettingsOf } from '../types'
import type { ProductWithCategory } from '#shared/types/api'
import { localizedProductName, localizedProductDescription } from '#shared/utils/localizedProduct'

/**
 * Featured single product block — a large two-column spotlight (image one side,
 * heading + optional description + CTA the other). Fetches the product by id via
 * `useAsyncData` (SSR-safe, stable key). A missing/deleted product → renders
 * nothing. Price (ShopPriceDisplay) + localized name are locale/currency-aware,
 * so they live under `<ClientOnly>`.
 */
const props = defineProps<{
  settings?: SettingsOf<'featured-product'>
}>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { apiFetch } = useApi()

const productId = computed(() => props.settings?.product_id ?? null)

const { data: product } = useAsyncData<ProductWithCategory | null>(
  () => `block-featured-product-${productId.value ?? 'none'}`,
  async () => {
    if (productId.value == null) return null
    try {
      return await apiFetch<ProductWithCategory>(`/api/v1/products/${productId.value}`)
    }
    catch {
      return null
    }
  },
  { default: () => null, watch: [productId] },
)

const imageLeft = computed(() => (props.settings?.layout ?? 'image-left') === 'image-left')
const displayName = computed(() =>
  product.value ? localizedProductName(product.value, locale.value) : '',
)
const description = computed(() =>
  product.value ? localizedProductDescription(product.value, locale.value) : '',
)
const primaryImage = computed(() => {
  const images = product.value?.images ?? []
  return images.find(img => img.is_primary) ?? images[0] ?? null
})
const to = computed(() =>
  product.value ? localePath(`/products/${product.value.slug}`) : '#',
)
</script>

<template>
  <section
    v-if="product"
    class="c-featured-product-block mx-auto w-full max-w-[2560px] px-4 py-12"
  >
    <div
      class="grid items-center gap-8 md:grid-cols-2"
      :class="!imageLeft && 'md:[&>*:first-child]:order-2'"
    >
      <NuxtLink
        :to="to"
        class="block overflow-hidden rounded-lg bg-elevated"
      >
        <NuxtImg
          v-if="primaryImage"
          :src="primaryImage.url"
          :alt="primaryImage.alt_text ?? displayName"
          class="aspect-square w-full object-cover"
          sizes="xs:100vw md:50vw"
          loading="lazy"
        />
        <CmsImagePlaceholder
          v-else
          class="aspect-square w-full"
        />
      </NuxtLink>

      <div class="flex flex-col items-start gap-4">
        <ClientOnly>
          <h2 class="text-3xl font-bold">
            {{ displayName }}
          </h2>
          <ShopPriceDisplay
            :product="product"
            size="lg"
          />
          <p
            v-if="(settings?.show_description ?? true) && description"
            class="text-muted line-clamp-5"
          >
            {{ description }}
          </p>
        </ClientOnly>
        <UButton
          :to="to"
          size="lg"
          color="primary"
        >
          {{ settings?.cta_label || t('blocks.cta.shopNow') }}
        </UButton>
      </div>
    </div>
  </section>
</template>
