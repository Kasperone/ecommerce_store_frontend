<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * Brand wordmark, shared by the Header and the Footer.
 *
 * A lightweight inline SVG mark + the store name as text (so it stays crisp at
 * any size, theme-aware via `currentColor`, and accessible — the whole control
 * carries a single `aria-label`). It links to the locale-aware home route.
 */
withDefaults(defineProps<{
  /** Pixel size of the square mark. */
  size?: number
  /** When false, render the mark only (no wordmark text). */
  showText?: boolean
}>(), {
  size: 24,
  showText: true,
})

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <ULink
    :to="localePath('/')"
    :aria-label="t('footer.logo.homeAria')"
    class="inline-flex items-center gap-2 text-highlighted hover:text-primary transition-colors"
  >
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
    >{{ t('footer.logo.name') }}</span>
  </ULink>
</template>
