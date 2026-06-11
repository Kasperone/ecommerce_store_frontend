<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'

/**
 * Rich text / WYSIWYG block — an optional heading + a body of server-sanitised
 * HTML, in a constrained reading width + alignment. The body is sanitised by the
 * backend on save (same trust model as `CustomHtmlBlock`), so `v-html` is
 * acceptable; we still default to empty + only render when there is content.
 */
const props = defineProps<{
  settings?: SettingsOf<'rich-text'>
}>()

const body = computed(() => props.settings?.body ?? '')

const widthClass = computed(() => ({
  narrow: 'max-w-2xl',
  normal: 'max-w-4xl',
  wide: 'max-w-[2560px]',
}[props.settings?.width ?? 'normal']))

const alignClass = computed(() => ({
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}[props.settings?.alignment ?? 'left']))
</script>

<template>
  <section
    v-if="settings?.heading || body"
    class="c-rich-text-block mx-auto w-full px-4 py-12"
    :class="[widthClass, alignClass]"
  >
    <h2
      v-if="settings?.heading"
      class="mb-4 text-2xl font-bold"
    >
      {{ settings.heading }}
    </h2>
    <!-- eslint-disable-next-line vue/no-v-html -- body is server-sanitised on save (allowlist) -->
    <div
      v-if="body"
      class="prose max-w-none dark:prose-invert"
      v-html="body"
    />
  </section>
</template>
