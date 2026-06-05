<script setup lang="ts">
/**
 * Catch-all CMS marketing page — the lowest-priority route in the app.
 *
 * Nuxt's file-based router scores `[...slug].vue` below every static and named
 * dynamic route, so real pages (`/products`, `/cart`, `/about`, …) always win;
 * only otherwise-unmatched paths fall through to here. We resolve the path to a
 * slug, fetch the published CMS layout via `usePublicPage` (SSR-safe
 * `useAsyncData`, locale-aware), render it through `<PageRenderer>`, and emit
 * SEO meta from the page's seo_* fields. A missing/unpublished slug resolves to
 * `null` → a proper 404 error page rather than an empty shell.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { locale } = useI18n()

// `params.slug` is an array of path segments for a catch-all route; rejoin it
// into the slug the backend keys CMS pages on (e.g. `/about-us/team` →
// `about-us/team`).
const slug = computed(() => {
  const raw = route.params.slug
  return (Array.isArray(raw) ? raw.join('/') : (raw ?? '')) as string
})

// A signed `?token=` (admin "Preview draft" link) switches the fetch to the
// draft-preview endpoint; without it the route serves published-only / 404s.
const previewToken = computed(() => {
  const raw = route.query.token
  return (Array.isArray(raw) ? raw[0] : raw) || undefined
})

const { data: page } = await usePublicPage(
  slug,
  () => locale.value,
  () => previewToken.value,
)

if (!page.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page not found',
    fatal: true,
  })
}

const sections = computed(() => page.value?.layout?.sections ?? [])

useSeoMeta({
  title: () => page.value?.seo_title ?? '',
  description: () => page.value?.seo_description ?? '',
  ogTitle: () => page.value?.seo_title ?? '',
  ogDescription: () => page.value?.seo_description ?? '',
  ogImage: () => page.value?.seo_image_url ?? '',
})
</script>

<template>
  <NuxtLayout>
    <PageRenderer :sections="sections" />
  </NuxtLayout>
</template>
