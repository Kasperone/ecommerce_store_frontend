<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'

/**
 * Hero / banner block — heading + optional subheading over a background image,
 * with an optional CTA. Generalises the `home_hero` banner. Pure presentational:
 * all copy comes from `settings` (no locale/currency dependence), so it renders
 * identically SSR/client.
 */
const props = defineProps<{
  settings?: SettingsOf<'hero'>
}>()

const s = computed(() => props.settings)
const heading = computed(() => s.value?.heading ?? '')
const alignment = computed(() => s.value?.alignment ?? 'left')
const theme = computed(() => s.value?.theme ?? 'dark')

const alignClass = computed(() => ({
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
}[alignment.value]))

const textClass = computed(() => (theme.value === 'dark' ? 'text-white' : 'text-default'))

// Overlay opacity 0–100 → a 0–1 alpha for a black scrim over the image.
const overlayStyle = computed(() => ({
  backgroundColor: `rgba(0,0,0,${Math.min(Math.max(s.value?.overlay_opacity ?? 40, 0), 100) / 100})`,
}))
</script>

<template>
  <section
    v-if="heading || s?.image_url"
    class="c-hero-block relative isolate mx-auto w-full max-w-7xl overflow-hidden rounded-lg px-4"
  >
    <NuxtImg
      v-if="s?.image_url"
      :src="s.image_url"
      :alt="heading"
      class="absolute inset-0 -z-20 h-full w-full object-cover"
      sizes="100vw lg:1280px"
      loading="lazy"
    />
    <CmsImagePlaceholder
      v-else
      class="absolute inset-0 -z-20 h-full w-full rounded-lg"
    />
    <div
      v-if="s?.image_url"
      class="absolute inset-0 -z-10"
      :style="overlayStyle"
      aria-hidden="true"
    />

    <div
      class="flex min-h-[20rem] flex-col justify-center gap-4 py-16"
      :class="alignClass"
    >
      <h2
        class="text-3xl font-bold sm:text-4xl"
        :class="s?.image_url ? textClass : 'text-highlighted'"
      >
        {{ heading }}
      </h2>
      <p
        v-if="s?.subheading"
        class="max-w-2xl text-lg"
        :class="s?.image_url ? textClass : 'text-muted'"
      >
        {{ s.subheading }}
      </p>
      <div v-if="s?.cta_label && s?.cta_url">
        <UButton
          :to="s.cta_url"
          size="lg"
          color="primary"
        >
          {{ s.cta_label }}
        </UButton>
      </div>
    </div>
  </section>
</template>
