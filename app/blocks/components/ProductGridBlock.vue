<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SettingsOf } from '../types'
import { useBlockProducts } from '../useBlockProducts'

/**
 * Product grid block — resolves its `source` (featured / new / collection /
 * manual / bestsellers) to a product list via `useBlockProducts` (SSR-safe,
 * stable key) and renders the storefront `ShopProductGrid`. Empty list →
 * renders nothing. Price/locale-dependent bits live inside `ShopProductCard`,
 * which already handles currency.
 */
const props = defineProps<{
  settings?: SettingsOf<'product-grid'>
}>()

const { t } = useI18n()

const params = computed(() => ({
  source: props.settings?.source ?? 'featured',
  limit: props.settings?.limit ?? 8,
  collectionSlug: props.settings?.collection_slug,
  productIds: props.settings?.product_ids,
}))

const { data: products } = useBlockProducts(params, 'block-product-grid')
const items = computed(() => products.value ?? [])

const columnClass = computed(() => {
  const cols = Math.min(Math.max(props.settings?.columns ?? 4, 1), 6)
  return {
    1: 'sm:grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-3 lg:grid-cols-4',
    5: 'sm:grid-cols-3 lg:grid-cols-5',
    6: 'sm:grid-cols-3 lg:grid-cols-6',
  }[cols]
})
</script>

<template>
  <section
    v-if="items.length"
    class="c-product-grid-block mx-auto w-full max-w-2560px px-4 py-12"
  >
    <h2
      v-if="settings?.heading"
      class="mb-6 text-2xl font-bold"
    >
      {{ settings.heading }}
    </h2>
    <div
      class="grid grid-cols-2 gap-x-4 gap-y-8"
      :class="columnClass"
    >
      <ShopProductCard
        v-for="product in items"
        :key="product.id"
        :product="product"
      />
    </div>
  </section>
  <p
    v-else
    class="sr-only"
  >
    {{ t('blocks.products.empty') }}
  </p>
</template>
