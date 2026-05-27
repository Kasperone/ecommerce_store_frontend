<script setup lang="ts">
import { computed } from 'vue'
import { parseHighlightSegments } from '#shared/utils/searchHighlight'

/**
 * Renders a Meilisearch highlight string safely: each segment is a Vue text
 * node (auto-escaped), and only the matched segments are wrapped in a real
 * `<em>`. Never uses `v-html`, so admin-entered content can't inject markup.
 */
const props = defineProps<{ value: string | null | undefined }>()
const segments = computed(() => parseHighlightSegments(props.value))
</script>

<template>
  <span>
    <template
      v-for="(segment, index) in segments"
      :key="index"
    ><em
      v-if="segment.mark"
      class="rounded-sm bg-primary/15 font-semibold not-italic"
    >{{ segment.text }}</em><template v-else>{{ segment.text }}</template></template>
  </span>
</template>
