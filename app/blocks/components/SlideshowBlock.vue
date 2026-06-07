<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'
import type { components } from '#shared/types/api.gen'

type SlideBlock = components['schemas']['SlideBlock']

/**
 * Slideshow / carousel block — admin-authored slides (image + heading +
 * subheading + CTA) in a `UCarousel`. The carousel is
 * autoplay/dots/arrows-configurable. Empty `blocks` → renders nothing.
 */
const props = defineProps<{
  settings?: SettingsOf<'slideshow'>
  blocks?: SlideBlock[]
}>()

const slides = computed(() => props.blocks ?? [])
const autoplay = computed(() =>
  props.settings?.autoplay ? { delay: props.settings?.interval_ms ?? 6000 } : undefined,
)
</script>

<template>
  <section
    v-if="slides.length"
    class="c-slideshow-block mx-auto w-full max-w-7xl px-4"
  >
    <UCarousel
      v-slot="{ item }: { item: SlideBlock }"
      :items="slides"
      loop
      :arrows="settings?.show_arrows ?? true"
      :dots="settings?.show_dots ?? true"
      :autoplay="autoplay"
      :ui="{ item: 'basis-full' }"
      class="w-full"
    >
      <div class="relative isolate flex min-h-[18rem] flex-col justify-center overflow-hidden rounded-lg">
        <NuxtImg
          v-if="item.settings?.image_url"
          :src="item.settings.image_url"
          :alt="item.settings?.heading ?? ''"
          class="absolute inset-0 -z-20 h-full w-full object-cover"
          sizes="xs:100vw lg:1280px"
          loading="lazy"
        />
        <CmsImagePlaceholder
          v-else
          class="absolute inset-0 -z-20 h-full w-full"
        />
        <div
          v-if="item.settings?.image_url"
          class="absolute inset-0 -z-10 bg-gradient-to-r from-black/45 via-black/20 to-transparent"
          aria-hidden="true"
        />
        <div class="flex flex-col gap-3 p-8">
          <h3
            v-if="item.settings?.heading"
            class="text-2xl font-bold sm:text-3xl"
            :class="item.settings?.image_url ? 'text-white' : 'text-highlighted'"
          >
            {{ item.settings.heading }}
          </h3>
          <p
            v-if="item.settings?.subheading"
            class="max-w-xl text-lg"
            :class="item.settings?.image_url ? 'text-white/90' : 'text-muted'"
          >
            {{ item.settings.subheading }}
          </p>
          <div v-if="item.settings?.cta_label && item.settings?.cta_url">
            <UButton
              :to="item.settings.cta_url"
              color="primary"
            >
              {{ item.settings.cta_label }}
            </UButton>
          </div>
        </div>
      </div>
    </UCarousel>
  </section>
</template>
