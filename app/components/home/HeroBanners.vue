<script setup lang="ts">
import type { components } from '#shared/types/api.gen'

type BannerPublic = components['schemas']['BannerPublic']

const props = defineProps<{
  banners: BannerPublic[]
}>()

const { t } = useI18n()

// Empty list → render nothing (no layout shift, no error).
const visible = computed(() => props.banners ?? [])
</script>

<template>
  <section
    v-if="visible.length"
    class="c-hero-banners mx-auto w-full max-w-7xl px-4 pt-6"
    :aria-label="t('home.banners.heroLabel', { default: 'Featured promotions' })"
  >
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <template
        v-for="banner in visible"
        :key="banner.id"
      >
        <ULink
          v-if="banner.link_url"
          :to="banner.link_url"
          class="group relative isolate block overflow-hidden rounded-lg ring ring-default"
        >
          <HomeHeroBannerCard :banner="banner" />
        </ULink>
        <div
          v-else
          class="group relative isolate block overflow-hidden rounded-lg ring ring-default"
        >
          <HomeHeroBannerCard :banner="banner" />
        </div>
      </template>
    </div>
  </section>
</template>
