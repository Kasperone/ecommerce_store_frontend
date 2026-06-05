<script setup lang="ts">
/**
 * Renders a CMS page's ordered section list into Vue blocks.
 *
 * Each section is resolved against the block registry by its `type` discriminant
 * (falling back to `UnknownBlock`) and wrapped in `BlockBoundary` so one bad
 * block can't blank the page. Sections render in array order with no markup
 * between them (Shopify OS-2.0 style). Block-internal data fetching is SSR-safe
 * (`useAsyncData`), so this renderer is server-renderable end to end.
 */
import { resolveBlock } from '~/blocks/registry'
import UnknownBlock from '~/components/UnknownBlock.vue'
import type { Section } from '~/blocks/types'

const props = defineProps<{
  sections: Section[]
}>()

const items = computed(() => props.sections ?? [])
</script>

<template>
  <template
    v-for="(section, index) in items"
    :key="section.id ?? `${section.type}-${index}`"
  >
    <BlockBoundary :type="section.type">
      <component
        :is="resolveBlock(section.type) ?? UnknownBlock"
        :type="section.type"
        :settings="section.settings"
        :blocks="'blocks' in section ? section.blocks : undefined"
      />
    </BlockBoundary>
  </template>
</template>
