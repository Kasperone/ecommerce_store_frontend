<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * A single legal-document section: a heading plus one or more body paragraphs.
 *
 * `bodyKey` points at a `legal.json` paragraph **array** key; it is resolved
 * with `tm()` (which returns the raw message array) and each entry rendered
 * via `rt()` so it survives vue-i18n's message compilation (the `{'@'}`
 * escapes in contact details, etc.). Rendered with `v-for`.
 */
const props = defineProps<{
  heading: string
  bodyKey: string
}>()

const { tm, rt } = useI18n()

const paragraphs = computed(() => {
  const raw = tm(props.bodyKey)
  if (!Array.isArray(raw)) return []
  return raw.map(entry => rt(entry))
})
</script>

<template>
  <section class="c-legal-section">
    <h2 class="text-xl font-semibold mb-3">
      {{ heading }}
    </h2>
    <p
      v-for="(paragraph, i) in paragraphs"
      :key="i"
      class="text-muted leading-relaxed mb-3 last:mb-0"
    >
      {{ paragraph }}
    </p>
  </section>
</template>
