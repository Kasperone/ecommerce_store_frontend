<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'
import { useBlockProducts } from '../useBlockProducts'
import type { ProductResponse } from '#shared/types/api'

/**
 * Product carousel block — same product-source resolution as the grid, rendered
 * in a horizontally-scrolling `UCarousel` with a configurable slides-per-view.
 * SSR-safe (`useBlockProducts`); empty list → renders nothing.
 */
const props = defineProps<{
  settings?: SettingsOf<'product-carousel'>
}>()

const params = computed(() => ({
  source: props.settings?.source ?? 'featured',
  limit: props.settings?.limit ?? 12,
  collectionSlug: props.settings?.collection_slug,
  productIds: props.settings?.product_ids,
}))

const { data: products } = useBlockProducts(params, 'block-product-carousel')
const items = computed(() => products.value ?? [])

// Tailwind basis fractions per slides-per-view (1–6); clamp to a sane range.
const basisClass = computed(() => {
  const n = Math.min(Math.max(props.settings?.slides_per_view ?? 4, 1), 6)
  return {
    1: 'basis-full',
    2: 'basis-1/2',
    3: 'basis-1/2 md:basis-1/3',
    4: 'basis-1/2 md:basis-1/4',
    5: 'basis-1/2 md:basis-1/3 lg:basis-1/5',
    6: 'basis-1/2 md:basis-1/3 lg:basis-1/6',
  }[n]
})

const autoplay = computed(() =>
  props.settings?.autoplay ? { delay: 4000 } : undefined,
)
</script>

<template>
  <section
    v-if="items.length"
    class="c-product-carousel-block mx-auto w-full max-w-7xl px-4 py-12"
  >
    <h2
      v-if="settings?.heading"
      class="mb-6 text-2xl font-bold"
    >
      {{ settings.heading }}
    </h2>
    <UCarousel
      v-slot="{ item }: { item: ProductResponse }"
      :items="items"
      arrows
      :autoplay="autoplay"
      :ui="{ item: basisClass, container: 'flex items-stretch -ms-4' }"
      class="w-full"
    >
      <div class="ps-4">
        <ShopProductCard :product="item" />
      </div>
    </UCarousel>
  </section>
</template>
