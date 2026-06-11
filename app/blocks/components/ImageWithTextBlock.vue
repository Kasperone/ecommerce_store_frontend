<script setup lang="ts">
import { computed } from 'vue'
import type { SettingsOf } from '../types'

/**
 * Image-with-text block — a two-column layout pairing an image with a heading,
 * server-sanitised body, and an optional CTA. The image side is admin-positioned
 * left/right. Body is `v-html` (sanitised on save, same trust model as rich-text).
 */
const props = defineProps<{
  settings?: SettingsOf<'image-with-text'>
}>()

const body = computed(() => props.settings?.body ?? '')
const imageLeft = computed(() => (props.settings?.image_position ?? 'left') === 'left')
</script>

<template>
  <section
    v-if="settings?.image_url || settings?.heading || body"
    class="c-image-with-text-block mx-auto w-full max-w-[2560px] px-4 py-12"
  >
    <div
      class="grid items-center gap-8 md:grid-cols-2"
      :class="!imageLeft && 'md:[&>*:first-child]:order-2'"
    >
      <div class="overflow-hidden rounded-lg bg-elevated">
        <NuxtImg
          v-if="settings?.image_url"
          :src="settings.image_url"
          :alt="settings?.heading ?? ''"
          class="aspect-[4/3] w-full object-cover"
          sizes="xs:100vw md:50vw"
          loading="lazy"
        />
        <CmsImagePlaceholder
          v-else
          class="aspect-[4/3] w-full"
        />
      </div>

      <div class="flex flex-col gap-4">
        <h2
          v-if="settings?.heading"
          class="text-2xl font-bold"
        >
          {{ settings.heading }}
        </h2>
        <!-- eslint-disable-next-line vue/no-v-html -- body is server-sanitised on save (allowlist) -->
        <div
          v-if="body"
          class="prose max-w-none dark:prose-invert"
          v-html="body"
        />
        <div v-if="settings?.cta_label && settings?.cta_url">
          <UButton
            :to="settings.cta_url"
            color="primary"
          >
            {{ settings.cta_label }}
          </UButton>
        </div>
      </div>
    </div>
  </section>
</template>
