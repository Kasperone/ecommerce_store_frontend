<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * "You may also like" rail for the PDP. Fetches the related-products cards for
 * the current product slug and renders them through the same `<ShopProductGrid>`
 * the catalog uses, so the tiles are pixel-identical to the listing grid.
 *
 * The whole section is hidden when there's nothing to show — while the query is
 * still loading with no data, or when the backend returns an empty array (no
 * co-purchase / fallback signal). No empty placeholder.
 */

const props = defineProps<{
  slug: string
}>()

const { t } = useI18n()

const { data } = useRelatedProductsQuery(() => props.slug)

const products = computed(() => data.value ?? [])
const hasProducts = computed(() => products.value.length > 0)
</script>

<template>
  <section
    v-if="hasProducts"
    class="mt-16"
    :aria-label="t('related.title')"
  >
    <h2 class="mb-6 text-xl font-semibold">
      {{ t('related.title') }}
    </h2>
    <ShopProductGrid :products="products" />
  </section>
</template>
