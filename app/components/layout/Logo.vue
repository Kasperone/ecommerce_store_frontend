<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * Brand wordmark, shared by the Header and the Footer.
 *
 * A lightweight inline SVG mark + the store name as text (so it stays crisp at
 * any size, theme-aware via `currentColor`, and accessible — the whole control
 * carries a single `aria-label`).
 *
 * `link` controls whether the mark is its own `<a>` to the home route. Set it to
 * `false` when the Logo is placed inside an element that already links to home
 * (e.g. `UHeader`'s `#title` slot) — nesting an `<a>` inside an `<a>` is invalid
 * HTML, so the browser restructures the DOM and Vue reports a hydration mismatch.
 * The Footer uses the default (`link: true`) since it renders the mark standalone.
 */
withDefaults(defineProps<{
  /** Pixel size of the square mark. */
  size?: number
  /** When false, render the mark only (no wordmark text). */
  showText?: boolean
  /** When false, render a non-interactive wrapper (no link to home). */
  link?: boolean
}>(), {
  size: 24,
  showText: true,
  link: true,
})

const { t } = useI18n()
const localePath = useLocalePath()
const ULink = resolveComponent('ULink')

// Brand identity from the admin-editable store_config (SSR-serialized, empty-safe).
// The wordmark text uses store_name; an uploaded logo_url replaces the SVG mark.
const { data: storeConfig } = useStoreConfig()
const brandName = computed(() => storeConfig.value?.store_name?.trim() || t('footer.logo.name'))
const logoUrl = computed(() => storeConfig.value?.logo_url?.trim() || '')
</script>

<template>
  <component
    :is="link ? ULink : 'span'"
    :to="link ? localePath('/') : undefined"
    :aria-label="link ? t('footer.logo.homeAria', { name: brandName }) : undefined"
    class="inline-flex items-center gap-2 text-highlighted transition-colors"
    :class="link ? 'hover:text-primary' : ''"
  >
    <!-- An uploaded logo replaces the wordmark lockup entirely (it carries the
         brand on its own); otherwise fall back to the SVG mark + store name.
         Height-only NuxtImg → IPX scales to `size` (1x/2x densities) keeping
         aspect; a manually-pasted foreign URL passes through unoptimized. -->
    <NuxtImg
      v-if="logoUrl"
      :src="logoUrl"
      :alt="brandName"
      :height="size"
      :style="{ height: `${size}px` }"
      class="w-auto shrink-0 object-contain"
    />
    <template v-else>
      <svg
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-hidden="true"
        class="shrink-0 text-primary"
      >
        <path
          d="M3 8.5 12 3l9 5.5v7L12 21l-9-5.5v-7Z"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linejoin="round"
        />
        <path
          d="m3 8.5 9 5.5 9-5.5M12 14v7"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linejoin="round"
        />
      </svg>
      <span
        v-if="showText"
        class="text-lg font-semibold tracking-tight"
      >{{ brandName }}</span>
    </template>
  </component>
</template>
