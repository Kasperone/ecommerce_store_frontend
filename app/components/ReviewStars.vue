<script setup lang="ts">
/**
 * Read-only star rating (1-5). Filled positions are amber, the rest muted.
 * i18n-agnostic so both the admin moderation UI and the future storefront PDP
 * can reuse it — the parent passes a translated `aria-label`.
 */
const props = withDefaults(
  defineProps<{ rating: number, ariaLabel?: string, sizeClass?: string }>(),
  { ariaLabel: undefined, sizeClass: 'size-4' },
)

const MAX = 5
const stars = computed(() => Array.from({ length: MAX }, (_, i) => i < props.rating))
</script>

<template>
  <div
    class="inline-flex items-center gap-0.5"
    role="img"
    :aria-label="ariaLabel ?? `${rating} / ${MAX}`"
  >
    <UIcon
      v-for="(filled, i) in stars"
      :key="i"
      name="i-lucide-star"
      :class="[sizeClass, filled ? 'text-amber-400' : 'text-muted/30']"
      aria-hidden="true"
    />
  </div>
</template>
