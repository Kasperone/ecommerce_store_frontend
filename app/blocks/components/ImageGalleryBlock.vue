<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'
import type { components } from '#shared/types/api.gen'

type GalleryImageBlock = components['schemas']['GalleryImageBlock']

/**
 * Image gallery / lookbook — admin-authored images (image + alt + optional link)
 * in a grid, masonry, or horizontal carousel layout. Pure presentational; images
 * are in `blocks`. Empty → renders nothing.
 */
const props = defineProps<{
  settings?: SettingsOf<'image-gallery'>
  blocks?: GalleryImageBlock[]
}>()

// Keep empty tiles too — they render a placeholder until an image is uploaded.
const images = computed(() => props.blocks ?? [])
const layout = computed(() => props.settings?.layout ?? 'grid')

const columnClass = computed(() => {
  const cols = Math.min(Math.max(props.settings?.columns ?? 3, 1), 6)
  return {
    1: 'sm:grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-3 lg:grid-cols-5',
    6: 'sm:grid-cols-3 lg:grid-cols-6',
  }[cols]
})
</script>

<template>
  <section
    v-if="images.length"
    class="c-image-gallery-block mx-auto w-full max-w-[2560px] px-4 py-12"
  >
    <h2
      v-if="settings?.heading"
      class="mb-6 text-2xl font-bold"
    >
      {{ settings.heading }}
    </h2>

    <UCarousel
      v-if="layout === 'carousel'"
      v-slot="{ item }: { item: GalleryImageBlock }"
      :items="images"
      arrows
      :ui="{ item: 'basis-2/3 sm:basis-1/2 md:basis-1/3', container: 'flex -ms-4' }"
      class="w-full"
    >
      <component
        :is="item.settings?.link_url ? 'NuxtLink' : 'div'"
        :to="item.settings?.link_url || undefined"
        class="block ps-4"
      >
        <NuxtImg
          v-if="item.settings?.image_url"
          :src="item.settings.image_url"
          :alt="item.settings?.alt ?? ''"
          class="aspect-square w-full rounded-lg object-cover"
          sizes="xs:66vw sm:50vw md:33vw"
          loading="lazy"
        />
        <CmsImagePlaceholder
          v-else
          class="aspect-square w-full rounded-lg"
        />
      </component>
    </UCarousel>

    <div
      v-else
      class="grid grid-cols-2 gap-4"
      :class="[columnClass, layout === 'masonry' && 'sm:auto-rows-[12rem]']"
    >
      <component
        :is="img.settings?.link_url ? 'NuxtLink' : 'div'"
        v-for="(img, index) in images"
        :key="img.id ?? index"
        :to="img.settings?.link_url || undefined"
        class="block overflow-hidden rounded-lg"
        :class="layout === 'masonry' && index % 3 === 0 && 'sm:row-span-2'"
      >
        <NuxtImg
          v-if="img.settings?.image_url"
          :src="img.settings.image_url"
          :alt="img.settings?.alt ?? ''"
          class="h-full w-full object-cover"
          :class="layout === 'grid' && 'aspect-square'"
          sizes="xs:50vw sm:33vw lg:25vw"
          loading="lazy"
        />
        <CmsImagePlaceholder
          v-else
          class="h-full w-full"
          :class="layout === 'grid' && 'aspect-square'"
        />
      </component>
    </div>
  </section>
</template>
