<script setup lang="ts">
import type { TagChip } from '#shared/types/api'

defineProps<{ tag: TagChip, removable?: boolean }>()
defineEmits<{ remove: [] }>()

// Neutral default when a tag has no color set.
const DEFAULT_COLOR = '#9ca3af'
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border border-default px-2 py-0.5 text-xs"
  >
    <span
      class="size-2 rounded-full shrink-0"
      :style="{ backgroundColor: tag.color || DEFAULT_COLOR }"
    />
    <span>{{ tag.name }}</span>
    <button
      v-if="removable"
      type="button"
      class="text-muted hover:text-default rounded-full"
      :aria-label="$t('admin.tags.removeAria', { name: tag.name })"
      @click.stop="$emit('remove')"
    >
      <UIcon
        name="i-lucide-x"
        class="size-3 block"
      />
    </button>
  </span>
</template>
