<script setup lang="ts">
import type { components } from '#shared/types/api.gen'

type BannerPublic = components['schemas']['BannerPublic']

defineProps<{
  banner: BannerPublic
}>()
</script>

<template>
  <img
    :src="banner.image_url"
    :alt="banner.title"
    class="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-105"
    loading="lazy"
  >
  <div
    class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
    aria-hidden="true"
  />
  <div class="absolute inset-x-0 bottom-0 p-4 text-white">
    <h3 class="text-lg font-semibold">
      {{ banner.title }}
    </h3>
    <p
      v-if="banner.subtitle"
      class="mt-1 text-sm text-white/90"
    >
      {{ banner.subtitle }}
    </p>
  </div>
</template>
