<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { components } from '#shared/types/api.gen'

type BannerPublic = components['schemas']['BannerPublic']

const { t, locale } = useI18n()
const localePath = useLocalePath()

// CMS-first homepage: render the published `home` page through <PageRenderer>
// when one exists, with a graceful fallback to the legacy hardcoded composition
// when no published page is found (so e2e/CI pass without a seeded DB and there
// is zero visual regression pre-seed). `usePublicPage` is SSR-safe `useAsyncData`
// and resolves a 404 to `null`.
const { data: page } = await usePublicPage('home', () => locale.value)

const sections = computed(() => page.value?.layout?.sections ?? [])
const hasCmsPage = computed(() => sections.value.length > 0)

// --- SEO ----------------------------------------------------------------
// When a CMS page is present, prefer its SEO fields; otherwise keep the
// legacy default title.
useHead({
  title: () => (hasCmsPage.value ? (page.value?.seo_title ?? t('hero.welcome')) : t('hero.welcome')),
})
useSeoMeta({
  description: () => (hasCmsPage.value ? page.value?.seo_description : undefined),
  ogTitle: () => (hasCmsPage.value ? page.value?.seo_title : undefined),
  ogDescription: () => (hasCmsPage.value ? page.value?.seo_description : undefined),
  ogImage: () => (hasCmsPage.value ? page.value?.seo_image_url : undefined),
})

// --- Legacy fallback data (unchanged) -----------------------------------
// Kept so the fallback branch is pixel-identical to the previous homepage.
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
    <PageRenderer
      v-if="hasCmsPage"
      :sections="sections"
    />
    <template v-else>
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
    </template>
  </NuxtLayout>
</template>
