<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SettingsOf } from '../types'

/**
 * Promo strip / announcement bar — a single full-width line of text with an
 * optional link, optional custom background colour, and an optional dismiss
 * button. Generalises the `promo_strip` banner.
 *
 * The schedule window (`starts_at`/`ends_at`) is enforced server-side at
 * publish; we render whatever the published layout contains.
 */
const props = defineProps<{
  settings?: SettingsOf<'promo-strip'>
}>()

const text = computed(() => props.settings?.text ?? '')
const bgStyle = computed(() =>
  props.settings?.bg_color ? { backgroundColor: props.settings.bg_color } : undefined,
)

// Dismissal is a client-only interaction — start visible (SSR-stable) and hide
// on click. Wrapped in <ClientOnly> in the template for the button only.
const dismissed = ref(false)
</script>

<template>
  <section
    v-if="text && !dismissed"
    class="c-promo-strip-block w-full"
    :class="!settings?.bg_color && 'bg-primary text-inverted'"
    :style="bgStyle"
  >
    <div class="mx-auto flex w-full max-w-[2560px] items-center justify-center gap-4 px-4 py-2 text-sm">
      <ULink
        v-if="settings?.link_url"
        :to="settings.link_url"
        class="font-medium hover:underline"
      >
        {{ text }}
      </ULink>
      <span
        v-else
        class="font-medium"
      >{{ text }}</span>

      <ClientOnly>
        <button
          v-if="settings?.dismissible"
          type="button"
          class="ml-auto inline-flex shrink-0 opacity-80 hover:opacity-100"
          aria-label="Dismiss"
          @click="dismissed = true"
        >
          <UIcon
            name="i-lucide-x"
            class="size-4"
          />
        </button>
      </ClientOnly>
    </div>
  </section>
</template>
