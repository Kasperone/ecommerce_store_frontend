<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'

/**
 * Spacer / divider — vertical whitespace of a configurable height, with an
 * optional horizontal rule (custom colour). Purely decorative: marked
 * `aria-hidden` so it's skipped by assistive tech.
 */
const props = defineProps<{
  settings?: SettingsOf<'spacer'>
}>()

const height = computed(() => Math.min(Math.max(props.settings?.height ?? 48, 0), 480))
const dividerStyle = computed(() =>
  props.settings?.color ? { borderColor: props.settings.color } : undefined,
)
</script>

<template>
  <div
    class="c-spacer-block mx-auto flex w-full max-w-7xl items-center px-4"
    :style="{ height: `${height}px` }"
    aria-hidden="true"
  >
    <hr
      v-if="settings?.show_divider"
      class="w-full border-t border-default"
      :style="dividerStyle"
    >
  </div>
</template>
