<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProductResponse, ProductWithCategory } from '#shared/types/api'
import { localizedProductName } from '#shared/utils/localizedProduct'

const props = defineProps<{
  product: ProductResponse | ProductWithCategory
}>()

const { t, locale } = useI18n()
const localePath = useLocalePath()

const to = computed(() => localePath(`/products/${props.product.slug}`))
const displayName = computed(() => localizedProductName(props.product, locale.value))

const primaryImage = computed(() => {
  const images = props.product.images ?? []
  return images.find(img => img.is_primary) ?? images[0] ?? null
})

const outOfStock = computed(() => props.product.stock <= 0)
</script>

<template>
  <article class="group flex flex-col">
    <NuxtLink
      :to="to"
      class="block"
      :aria-label="displayName"
    >
      <div class="relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
        <img
          v-if="primaryImage"
          :src="primaryImage.url"
          :alt="primaryImage.alt_text ?? displayName"
          class="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        >
        <div
          v-else
          class="flex h-full w-full items-center justify-center text-muted"
        >
          <UIcon
            name="i-lucide-image"
            class="size-10"
          />
        </div>
        <UBadge
          v-if="outOfStock"
          color="neutral"
          variant="solid"
          class="absolute left-2 top-2"
        >
          {{ t('stock.outOfStock') }}
        </UBadge>
      </div>
    </NuxtLink>

    <div class="mt-3 flex flex-1 flex-col gap-2">
      <NuxtLink
        :to="to"
        class="font-medium hover:text-primary line-clamp-2"
      >
        {{ displayName }}
      </NuxtLink>
      <ShopPriceDisplay :product="product" />
      <div class="mt-auto pt-2">
        <ShopAddToCartButton
          :product="product"
          block
        />
      </div>
    </div>
  </article>
</template>
