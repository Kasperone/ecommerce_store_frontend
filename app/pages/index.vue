<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { components } from '#shared/types/api.gen'

type BannerPublic = components['schemas']['BannerPublic']

const { t } = useI18n()
const localePath = useLocalePath()

useHead({ title: () => t('hero.welcome') })

const { data: featured } = useFeaturedProducts(8)
const items = computed(() => featured.value ?? [])

// Admin-managed storefront banners — public read, SSR/SEO-friendly via
// `useAsyncData` (matches the catalog pattern; NOT Pinia-Colada). Empty list →
// the presentational components render nothing.
const { apiFetch } = useApi()
const { data: heroBanners } = useAsyncData(
  'home-banners-hero',
  () => apiFetch<BannerPublic[]>('/api/v1/banners/', { query: { placement: 'home_hero' } }),
  { default: () => [] as BannerPublic[] },
)
const { data: promoBanners } = useAsyncData(
  'home-banners-promo',
  () => apiFetch<BannerPublic[]>('/api/v1/banners/', { query: { placement: 'promo_strip' } }),
  { default: () => [] as BannerPublic[] },
)
</script>

<template>
  <NuxtLayout>
    <HomePromoStrip :banners="promoBanners ?? []" />
    <div class="p-main">
      <HomeHeroSlider />
      <HomeHeroBanners :banners="heroBanners ?? []" />

      <section
        v-if="items.length"
        class="mx-auto w-full max-w-7xl px-4 py-12"
      >
        <div class="mb-6 flex items-center justify-between">
          <h2 class="text-2xl font-bold">
            {{ t('featured.title') }}
          </h2>
          <ULink
            :to="localePath('/products')"
            class="text-primary hover:underline"
          >
            {{ t('featured.viewAll') }}
          </ULink>
        </div>
        <ShopProductGrid :products="items" />
      </section>
    </div>
  </NuxtLayout>
</template>
