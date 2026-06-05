<script setup lang="ts">
/**
 * Visual (WYSIWYG) editing canvas for the CMS page builder.
 *
 * The Puck-style "own-your-data" model: a live preview of the working draft,
 * rendered with the REAL block components (same registry + `<BlockBoundary>` as
 * the storefront `PageRenderer`), wrapped in selection/drag/insert/delete chrome.
 * It is a *sibling* of `PageRenderer` — it does not duplicate render logic, it
 * adds editing affordances over the same block render.
 *
 * Every mutation drives the SAME `usePageEditorState` instance the form mode
 * uses (passed down as props + emitted events), so Save draft / Publish /
 * dirty-tracking work unchanged across both modes.
 *
 * Capabilities:
 *  - click a block → select (parent sets `selectedCid`; the SettingsForm edits it)
 *  - drag blocks to reorder (vuedraggable → emits `reorder` with the new cid order)
 *  - keyboard reorder (Alt+Arrow on a focused block → emits `move`)
 *  - "+ Add section here" drop-zones between/after blocks → emits `add-at` index
 *  - delete a block → emits `remove`
 *  - inner links never navigate (capture layer in `VisualCanvasBlock`)
 */
import draggable from 'vuedraggable'
import type { SectionDraft } from '~/composables/usePageEditorState'

const props = defineProps<{
  /** The draft sections (each with a stable `__cid`). */
  sections: SectionDraft[]
  /** The selected section's client id. */
  selectedCid: string | null
  /** Block type → display name map (from the schema registry). */
  typeNames: Record<string, string>
}>()

const emit = defineEmits<{
  /** A block was clicked/activated — select it. */
  'select': [cid: string]
  /** Delete the block. */
  'remove': [cid: string]
  /** Keyboard/toolbar up-down move. */
  'move': [payload: { cid: string, direction: 'up' | 'down' }]
  /** Drag reorder — the full new cid order. */
  'reorder': [orderedCids: string[]]
  /** Open the Add-section picker, inserting at `index`. */
  'add-at': [index: number]
}>()

const { t } = useI18n()

/** vuedraggable v-model proxy — on drop, emit the resulting cid order. */
const list = computed({
  get: () => props.sections,
  set: (value: SectionDraft[]) => emit('reorder', value.map(s => s.__cid)),
})

function nameFor(type: string): string {
  return props.typeNames[type] ?? type
}
</script>

<template>
  <div
    class="space-y-0"
    :data-testid="'visual-canvas'"
  >
    <!-- Leading drop-zone (insert at the very top). -->
    <button
      type="button"
      class="cms-dropzone group/dz flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-default py-1.5 text-xs text-muted opacity-60 transition hover:border-primary hover:bg-primary/5 hover:text-primary hover:opacity-100"
      :data-testid="'dropzone-0'"
      @click="emit('add-at', 0)"
    >
      <UIcon
        name="i-lucide-plus"
        class="size-3.5"
      />
      {{ t('admin.cms.visual.addHere') }}
    </button>

    <draggable
      v-model="list"
      item-key="__cid"
      handle=".cms-canvas-drag-handle"
      ghost-class="opacity-40"
      :group="'canvas'"
      :aria-label="t('admin.cms.visual.canvasLabel')"
    >
      <template #item="{ element, index }">
        <div>
          <AdminCmsVisualCanvasBlock
            :cid="element.__cid"
            :type="element.type"
            :settings="element.settings"
            :blocks="element.blocks"
            :name="nameFor(element.type)"
            :selected="element.__cid === selectedCid"
            :index="index"
            :total="sections.length"
            @select="emit('select', element.__cid)"
            @remove="emit('remove', element.__cid)"
            @move="(direction) => emit('move', { cid: element.__cid, direction })"
          />

          <!-- Trailing drop-zone after this block (insert at index + 1). -->
          <button
            type="button"
            class="cms-dropzone group/dz flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-default py-1.5 text-xs text-muted opacity-60 transition hover:border-primary hover:bg-primary/5 hover:text-primary hover:opacity-100"
            :data-testid="`dropzone-${index + 1}`"
            @click="emit('add-at', index + 1)"
          >
            <UIcon
              name="i-lucide-plus"
              class="size-3.5"
            />
            {{ t('admin.cms.visual.addHere') }}
          </button>
        </div>
      </template>
    </draggable>

    <!-- Empty-canvas prompt (drop-zone above already offers an insert point). -->
    <p
      v-if="sections.length === 0"
      class="py-12 text-center text-sm text-muted"
      :data-testid="'visual-canvas-empty'"
    >
      {{ t('admin.cms.visual.empty') }}
    </p>
  </div>
</template>
