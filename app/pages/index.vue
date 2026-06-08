<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

// CMS-driven homepage: render the published `home` page through <PageRenderer>.
// `usePublicPage` is SSR-safe `useAsyncData` and resolves a 404 to `null`; when
// no published page exists the homepage renders nothing (the legacy hardcoded
// fallback composition was removed once the storefront moved fully to the CMS).
const { data: page } = await usePublicPage('home', () => locale.value)

const sections = computed(() => page.value?.layout?.sections ?? [])
const hasCmsPage = computed(() => sections.value.length > 0)

// --- SEO ----------------------------------------------------------------
// Prefer the CMS page's SEO fields when present; otherwise keep the default
// welcome title.
useHead({
  title: () => (hasCmsPage.value ? (page.value?.seo_title ?? t('hero.welcome')) : t('hero.welcome')),
})
// og:image falls back to the site-wide static share image when the CMS page
// carries none — a page-level `undefined` would otherwise clobber the global
// fallback registered in app.vue (verified: no og:image rendered at all).
const { url: siteUrl } = useSiteConfig()
useSeoMeta({
  description: () => (hasCmsPage.value ? page.value?.seo_description : undefined),
  ogTitle: () => (hasCmsPage.value ? page.value?.seo_title : undefined),
  ogDescription: () => (hasCmsPage.value ? page.value?.seo_description : undefined),
  ogImage: () => page.value?.seo_image_url || `${siteUrl}/social-share.png`,
})
</script>

<template>
  <NuxtLayout>
    <!-- Active home_hero banners (admin Marketing → Banners) render above the
         CMS page. Empty → nothing (F8: previously orphaned — no consumer). -->
    <HomeBanners />

    <PageRenderer
      v-if="hasCmsPage"
      :sections="sections"
    />
  </NuxtLayout>
</template>
