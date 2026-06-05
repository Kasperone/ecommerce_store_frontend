<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'

/**
 * Custom HTML / embed block — renders raw admin-authored HTML.
 *
 * The backend sanitises this html (allowlist) on save and the page CRUD is
 * admin-gated, so `v-html` is the intended render path here. We still guard
 * defensively: only render when there's content, and contain it in a scoped
 * wrapper. This block is the storefront's main XSS surface — the trust boundary
 * is the backend sanitiser, not this component.
 */
const props = defineProps<{
  settings?: SettingsOf<'custom-html'>
}>()

const html = computed(() => props.settings?.html ?? '')
</script>

<template>
  <section
    v-if="html"
    class="c-custom-html-block mx-auto w-full max-w-7xl px-4 py-6"
  >
    <!-- eslint-disable-next-line vue/no-v-html -- html is server-sanitised on save (allowlist); admin-gated -->
    <div v-html="html" />
  </section>
</template>
