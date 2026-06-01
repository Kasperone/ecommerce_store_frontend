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
    class="c-promo-strip w-full bg-primary text-inverted"
    :aria-label="t('home.banners.promoLabel', { default: 'Promotions' })"
  >
    <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-2 text-sm">
      <template
        v-for="banner in visible"
        :key="banner.id"
      >
        <ULink
          v-if="banner.link_url"
          :to="banner.link_url"
          class="inline-flex items-center gap-2 font-medium hover:underline"
        >
          <span>{{ banner.title }}</span>
          <span
            v-if="banner.subtitle"
            class="opacity-80"
          >{{ banner.subtitle }}</span>
        </ULink>
        <span
          v-else
          class="inline-flex items-center gap-2 font-medium"
        >
          <span>{{ banner.title }}</span>
          <span
            v-if="banner.subtitle"
            class="opacity-80"
          >{{ banner.subtitle }}</span>
        </span>
      </template>
    </div>
  </section>
</template>
