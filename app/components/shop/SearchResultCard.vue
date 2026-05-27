<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SearchResultItem } from '#shared/types/api'

/**
 * One product hit on the `/search` results grid. Like `ShopProductCard` but
 * over a `SearchResultItem` (single `image_url`, already-localized name) and
 * with the matched terms emphasized via `<ShopHighlightText>`.
 */
const props = defineProps<{ result: SearchResultItem }>()

const { t } = useI18n()
const localePath = useLocalePath()

const to = computed(() => localePath(`/products/${props.result.slug}`))
const outOfStock = computed(() => !props.result.in_stock)
</script>

<template>
  <article class="group flex flex-col">
    <NuxtLink
      :to="to"
      class="block"
      :aria-label="result.name"
    >
      <div class="relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
        <img
          v-if="result.image_url"
          :src="result.image_url"
          :alt="result.name"
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
        <ShopHighlightText :value="result.name_highlight" />
      </NuxtLink>
      <ShopPriceDisplay :product="result" />
    </div>
  </article>
</template>
