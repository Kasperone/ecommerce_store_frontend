<script setup lang="ts">
/**
 * Reorderable section list (the left rail of the page editor).
 *
 * vuedraggable v4 wraps the working-draft sections; dragging reorders them and
 * the new order flows back through `v-model` (the parent persists it to the
 * unsaved draft). Each row is selectable (drives the settings panel) and
 * removable. Keyboard move-up / move-down buttons provide an a11y-friendly
 * alternative to mouse drag.
 */
import draggable from 'vuedraggable'
import type { SectionDraft } from '~/composables/usePageEditorState'

const props = defineProps<{
  /** The draft sections (each carries a stable client `id`). */
  modelValue: SectionDraft[]
  /** The currently selected section's client id. */
  selectedId: string | null
  /** Block type → display name map (from the schema registry). */
  typeNames: Record<string, string>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: SectionDraft[]]
  'select': [id: string]
  'remove': [id: string]
  'move': [payload: { id: string, direction: 'up' | 'down' }]
}>()

const { t } = useI18n()

const list = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

function nameFor(type: string): string {
  return props.typeNames[type] ?? type
}

function previewLabel(section: SectionDraft): string {
  const s = section.settings as Record<string, unknown>
  const candidate = s.heading ?? s.text ?? s.coupon_code ?? s.label
  return typeof candidate === 'string' && candidate.trim() ? candidate : ''
}
</script>

<template>
  <div>
    <draggable
      v-model="list"
      item-key="__cid"
      handle=".cms-drag-handle"
      ghost-class="opacity-50"
      class="space-y-2"
      :aria-label="t('admin.cms.sections.listLabel')"
      role="list"
    >
      <template #item="{ element, index }">
        <div
          role="listitem"
          class="flex items-center gap-2 rounded-md border p-2 transition-colors"
          :class="element.__cid === selectedId ? 'border-primary bg-elevated' : 'border-default'"
          :data-testid="`section-row-${index}`"
        >
          <button
            type="button"
            class="cms-drag-handle cursor-grab text-muted hover:text-default shrink-0"
            :aria-label="t('admin.cms.sections.dragHandle')"
            tabindex="-1"
          >
            <UIcon
              name="i-lucide-grip-vertical"
              class="size-4"
            />
          </button>

          <button
            type="button"
            class="flex-1 min-w-0 text-left"
            @click="emit('select', element.__cid)"
          >
            <span class="font-medium text-sm block truncate">{{ nameFor(element.type) }}</span>
            <span
              v-if="previewLabel(element)"
              class="text-muted text-xs block truncate"
            >{{ previewLabel(element) }}</span>
          </button>

          <div class="flex items-center gap-0.5 shrink-0">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-chevron-up"
              :disabled="index === 0"
              :aria-label="t('admin.cms.sections.moveUp')"
              @click="emit('move', { id: element.__cid, direction: 'up' })"
            />
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-chevron-down"
              :disabled="index === modelValue.length - 1"
              :aria-label="t('admin.cms.sections.moveDown')"
              @click="emit('move', { id: element.__cid, direction: 'down' })"
            />
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              :aria-label="t('admin.cms.sections.remove')"
              @click="emit('remove', element.__cid)"
            />
          </div>
        </div>
      </template>
    </draggable>

    <p
      v-if="modelValue.length === 0"
      class="text-muted text-sm py-6 text-center"
    >
      {{ t('admin.cms.sections.empty') }}
    </p>
  </div>
</template>
