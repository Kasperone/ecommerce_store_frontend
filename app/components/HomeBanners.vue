<script setup lang="ts">
import { computed } from 'vue'

/**
 * Storefront homepage banners (placement `home_hero`).
 *
 * Consumes the public `GET /api/v1/banners/` via `useHomeBanners` and renders
 * the active, in-window hero banners (already filtered + ordered server-side).
 * Empty list ⇒ renders nothing, so it's safe to drop above the CMS
 * `<PageRenderer>` on the homepage. Closes finding F8.
 */
const localePath = useLocalePath()
const NuxtLink = resolveComponent('NuxtLink')

const { data: banners } = useHomeBanners()

const heroBanners = computed(() =>
  (banners.value ?? []).filter(b => b.placement === 'home_hero'),
)

/** Internal paths (`/foo`) go through `localePath`; anything else is left as-is
 * (absolute/external link). */
function resolveLink(linkUrl: string | null | undefined): string | undefined {
  if (!linkUrl) return undefined
  return linkUrl.startsWith('/') ? localePath(linkUrl) : linkUrl
}
</script>

<template>
  <section
    v-if="heroBanners.length"
    class="c-home-banners"
    aria-label="Featured"
  >
    <component
      :is="resolveLink(banner.link_url) ? NuxtLink : 'div'"
      v-for="banner in heroBanners"
      :key="banner.id"
      :to="resolveLink(banner.link_url)"
      class="relative block overflow-hidden rounded-lg"
    >
      <NuxtImg
        :src="banner.image_url"
        :alt="banner.title"
        width="1920"
        height="640"
        sizes="100vw"
        loading="eager"
        class="h-48 w-full object-cover sm:h-64 lg:h-80"
      />
      <div
        v-if="banner.title || banner.subtitle"
        class="absolute inset-0 flex flex-col justify-center gap-2 bg-gradient-to-r
               from-black/55 to-transparent p-6 sm:p-10"
      >
        <h2
          v-if="banner.title"
          class="max-w-xl text-2xl font-bold text-white text-pretty sm:text-3xl lg:text-4xl"
        >
          {{ banner.title }}
        </h2>
        <p
          v-if="banner.subtitle"
          class="max-w-xl text-base text-white/90 text-pretty sm:text-lg"
        >
          {{ banner.subtitle }}
        </p>
      </div>
    </component>
  </section>
</template>
