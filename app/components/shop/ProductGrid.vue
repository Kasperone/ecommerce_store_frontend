<script setup lang="ts">
import type { ProductResponse, ProductWithCategory } from '#shared/types/api'

defineProps<{
  products: (ProductResponse | ProductWithCategory)[]
}>()
</script>

<template>
  <div class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
    <ShopProductCard
      v-for="product in products"
      :key="product.id"
      :product="product"
    />
  </div>
</template>
