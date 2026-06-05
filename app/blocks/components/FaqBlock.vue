<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'
import type { components } from '#shared/types/api.gen'

type FaqItemBlock = components['schemas']['FaqItemBlock']

/**
 * FAQ / accordion block — an optional heading + a list of question/answer items
 * rendered as a `UAccordion`. Answers are server-sanitised HTML (same trust
 * model as rich-text). Empty → renders nothing.
 */
const props = defineProps<{
  settings?: SettingsOf<'faq'>
  blocks?: FaqItemBlock[]
}>()

const items = computed(() =>
  (props.blocks ?? [])
    .filter(b => b.settings?.question)
    .map((b, i) => ({
      label: b.settings?.question ?? '',
      content: b.settings?.answer ?? '',
      value: b.id ?? String(i),
    })),
)
</script>

<template>
  <section
    v-if="items.length"
    class="c-faq-block mx-auto w-full max-w-4xl px-4 py-12"
  >
    <h2
      v-if="settings?.heading"
      class="mb-6 text-2xl font-bold"
    >
      {{ settings.heading }}
    </h2>
    <UAccordion :items="items">
      <template #content="{ item }">
        <!-- eslint-disable-next-line vue/no-v-html -- answer is server-sanitised on save (allowlist) -->
        <div
          class="prose max-w-none pb-4 text-muted dark:prose-invert"
          v-html="item.content"
        />
      </template>
    </UAccordion>
  </section>
</template>
