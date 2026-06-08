<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const isPl = computed(() => locale.value === 'pl')

// Active collections with member counts — SSR-fetched (crawlable, payload-hydrated).
const { data: collections } = useCollectionsListPublic()
const items = computed(() => collections.value ?? [])

function localizedName(c: { name: string, name_pl?: string | null }) {
  return (isPl.value ? c.name_pl : c.name) || c.name
}
function localizedSlug(c: { slug: string, slug_pl?: string | null }) {
  return (isPl.value ? c.slug_pl : c.slug) || c.slug
}

useSeoMeta({
  title: () => t('collection.index.title'),
  description: () => t('collection.index.subtitle'),
  ogTitle: () => t('collection.index.title'),
  ogDescription: () => t('collection.index.subtitle'),
})

// Type the auto WebPage node as a CollectionPage listing the collections.
useSchemaOrg([defineWebPage({ '@type': 'CollectionPage' })])
</script>

<template>
  <NuxtLayout>
    <div class="mx-auto w-full max-w-7xl space-y-6 px-4 py-8">
      <header class="space-y-1">
        <h1 class="text-2xl font-bold">
          {{ t('collection.index.title') }}
        </h1>
        <p class="text-muted">
          {{ t('collection.index.subtitle') }}
        </p>
      </header>

      <ClientOnly>
        <div
          v-if="items.length"
          class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <NuxtLink
            v-for="c in items"
            :key="c.id"
            :to="localePath(`/collections/${localizedSlug(c)}`)"
            :class="[
              'group relative overflow-hidden rounded-xl border border-default',
              'bg-elevated transition hover:border-primary',
            ]"
          >
            <div class="aspect-[16/9] w-full overflow-hidden bg-muted">
              <img
                v-if="c.hero_image_url"
                :src="c.hero_image_url"
                :alt="c.hero_image_alt ?? localizedName(c)"
                class="h-full w-full object-cover transition group-hover:scale-105"
              >
              <div
                v-else
                class="flex h-full w-full items-center justify-center text-muted"
              >
                <UIcon
                  name="i-lucide-layout-grid"
                  class="size-10"
                />
              </div>
            </div>
            <div class="space-y-1 p-4">
              <h2 class="font-semibold group-hover:text-primary">
                {{ localizedName(c) }}
              </h2>
              <p class="text-sm text-muted">
                {{ t('collection.productCount', { count: c.product_count }, c.product_count) }}
              </p>
            </div>
          </NuxtLink>
        </div>

        <p
          v-else
          class="py-12 text-center text-muted"
        >
          {{ t('collection.index.empty') }}
        </p>
      </ClientOnly>
    </div>
  </NuxtLayout>
</template>
