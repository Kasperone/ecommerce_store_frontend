<script setup lang="ts">
/**
 * Interactive 1-5 star rating input (write path). `<ReviewStars>` is the
 * read-only counterpart. v-model:rating; i18n-agnostic — the parent passes a
 * `groupLabel` and a `starLabel(n)` for accessible names.
 */
const rating = defineModel<number>('rating', { default: 0 })

const props = withDefaults(
  defineProps<{ groupLabel?: string, starLabel?: (n: number) => string }>(),
  { groupLabel: 'Rating', starLabel: undefined },
)

const MAX = 5
const hover = ref(0)

function label(n: number) {
  return props.starLabel ? props.starLabel(n) : `${n} / ${MAX}`
}
</script>

<template>
  <div
    class="inline-flex items-center gap-1"
    role="group"
    :aria-label="groupLabel"
  >
    <button
      v-for="n in MAX"
      :key="n"
      type="button"
      :aria-label="label(n)"
      :aria-pressed="rating === n"
      :class="[
        'cursor-pointer rounded p-0.5 transition-transform hover:scale-110',
        'focus-visible:outline-2 focus-visible:outline-primary',
      ]"
      @click="rating = n"
      @mouseenter="hover = n"
      @mouseleave="hover = 0"
    >
      <UIcon
        name="i-lucide-star"
        class="size-7"
        :class="n <= (hover || rating) ? 'text-amber-400' : 'text-muted/40'"
      />
    </button>
  </div>
</template>
