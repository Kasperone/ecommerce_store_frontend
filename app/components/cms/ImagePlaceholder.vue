<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Generated placeholder for a CMS image slot with no image uploaded yet.
 * Pure CSS gradient + icon — ships no image bytes. Fills its parent; the parent
 * owns sizing/positioning (pass `class`, e.g. `absolute inset-0` for a background
 * layer or `aspect-[4/3] w-full` for an inline slot). Pass `label=""` to hide
 * the caption (e.g. behind hero text). Auto-imports as `<CmsImagePlaceholder>`.
 */
const props = withDefaults(defineProps<{
  label?: string
  iconClass?: string
}>(), {
  label: undefined,
  iconClass: 'size-10',
})

const { t } = useI18n()
const caption = computed(() =>
  props.label === undefined ? t('blocks.imagePlaceholder.label') : props.label,
)
</script>

<template>
  <div
    class="c-image-placeholder flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-elevated text-dimmed"
    role="img"
    :aria-label="caption || t('blocks.imagePlaceholder.label')"
  >
    <UIcon
      name="i-lucide-image"
      :class="iconClass"
    />
    <span
      v-if="caption"
      class="text-sm font-medium"
    >
      {{ caption }}
    </span>
  </div>
</template>
