<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/**
 * "Back to top" control for the footer baseline bar.
 *
 * Smoothly scrolls the window to the top, respecting the user's reduced-motion
 * preference (jumps instantly when `prefers-reduced-motion: reduce`). Moves
 * keyboard focus to the document body so screen-reader users land at the top of
 * the page rather than mid-footer.
 */
const { t } = useI18n()

function scrollToTop() {
  if (!import.meta.client) return

  const prefersReducedMotion
    = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })

  // Send focus back to the top of the document for keyboard / SR users.
  const skipTarget = document.querySelector<HTMLElement>('main, #main, body')
  skipTarget?.focus?.({ preventScroll: true })
}
</script>

<template>
  <UButton
    color="neutral"
    variant="ghost"
    size="sm"
    icon="i-lucide-arrow-up"
    :aria-label="t('footer.backToTop')"
    @click="scrollToTop"
  >
    {{ t('footer.backToTop') }}
  </UButton>
</template>
