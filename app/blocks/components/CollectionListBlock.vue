<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'
import type { components } from '#shared/types/api.gen'

type CollectionTileBlock = components['schemas']['CollectionTileBlock']

/**
 * Collection list / category tiles — admin-authored image tiles (image + label +
 * link), laid out in a configurable column grid. Pure presentational (no data
 * fetch); the tiles' content is in `blocks`. Empty → renders nothing.
 */
const props = defineProps<{
  settings?: SettingsOf<'collection-list'>
  blocks?: CollectionTileBlock[]
}>()

const tiles = computed(() => props.blocks ?? [])

const columnClass = computed(() => {
  const cols = Math.min(Math.max(props.settings?.columns ?? 3, 1), 6)
  return {
    1: 'sm:grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-3 lg:grid-cols-5',
    6: 'sm:grid-cols-3 lg:grid-cols-6',
  }[cols]
})
</script>

<template>
  <section
    v-if="tiles.length"
    class="c-collection-list-block mx-auto w-full max-w-7xl px-4 py-12"
  >
    <h2
      v-if="settings?.heading"
      class="mb-6 text-2xl font-bold"
    >
      {{ settings.heading }}
    </h2>
    <div
      class="grid grid-cols-2 gap-4"
      :class="columnClass"
    >
      <component
        :is="tile.settings?.link_url ? 'NuxtLink' : 'div'"
        v-for="(tile, index) in tiles"
        :key="tile.id ?? index"
        :to="tile.settings?.link_url || undefined"
        class="group relative isolate block aspect-[4/3] overflow-hidden rounded-lg bg-elevated"
      >
        <NuxtImg
          v-if="tile.settings?.image_url"
          :src="tile.settings.image_url"
          :alt="tile.settings?.label ?? ''"
          class="absolute inset-0 -z-10 h-full w-full object-cover transition-transform group-hover:scale-105"
          sizes="50vw sm:33vw lg:25vw"
          loading="lazy"
        />
        <CmsImagePlaceholder
          v-else
          class="absolute inset-0 -z-10 h-full w-full"
          label=""
        />
        <div
          v-if="tile.settings?.image_url"
          class="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent"
          aria-hidden="true"
        />
        <span
          v-if="tile.settings?.label"
          class="absolute inset-x-0 bottom-0 p-4 text-lg font-semibold"
          :class="tile.settings?.image_url ? 'text-white' : 'text-highlighted'"
        >
          {{ tile.settings.label }}
        </span>
      </component>
    </div>
  </section>
</template>
