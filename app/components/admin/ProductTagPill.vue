<script setup lang="ts">
import type { ProductTagChip } from '#shared/types/api'

/**
 * A PRODUCT tag chip — distinct from the customer `AdminTagPill`.
 *
 * Visually differentiated by a small tag glyph so product tags never read as
 * customer tags despite the shared chip shape. Accepts either a full
 * `ProductTagChip` (vocabulary-backed) or a free-form `{ name }` (a tag the
 * admin typed that hasn't been get-or-created yet — it has no id/color).
 */

defineProps<{
  tag: ProductTagChip | { name: string, color?: string | null }
  removable?: boolean
}>()
defineEmits<{ remove: [] }>()

// Neutral default when a tag has no color set.
const DEFAULT_COLOR = '#9ca3af'
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-md border border-default bg-elevated px-2 py-0.5 text-xs"
  >
    <UIcon
      name="i-lucide-tag"
      class="size-3 shrink-0"
      :style="{ color: tag.color || DEFAULT_COLOR }"
    />
    <span>{{ tag.name }}</span>
    <button
      v-if="removable"
      type="button"
      class="text-muted hover:text-default rounded-full"
      :aria-label="$t('admin.productTags.removeAria', { name: tag.name })"
      @click.stop="$emit('remove')"
    >
      <UIcon
        name="i-lucide-x"
        class="size-3 block"
      />
    </button>
  </span>
</template>
