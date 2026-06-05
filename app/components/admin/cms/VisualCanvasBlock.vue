<script setup lang="ts">
/**
 * One block on the visual canvas: the REAL Vue block (resolved from the same
 * registry `PageRenderer` uses) wrapped in editing chrome.
 *
 * Chrome:
 *  - A selectable/focusable shell: hover outline, click → select, focus ring on
 *    the selected block (a visible `ring`), `role="button"` + arrow/Enter a11y.
 *  - A floating toolbar (label · move up · move down · delete) plus a drag handle
 *    that vuedraggable's parent binds via the `.cms-canvas-drag-handle` class.
 *  - A transparent **capture layer** over the live block so a click selects the
 *    block instead of following an inner link / triggering an inner control.
 *    `pointer-events` on the block itself are disabled; the overlay owns clicks.
 *
 * It renders the block exactly like production (via `resolveBlock` + the same
 * `<BlockBoundary>` net), so the canvas is true WYSIWYG — no duplicated render
 * logic. All edits flow through events to the parent's shared editor state.
 */
import { resolveBlock } from '~/blocks/registry'
import UnknownBlock from '~/components/UnknownBlock.vue'

const props = defineProps<{
  /** Stable client id of the draft section. */
  cid: string
  /** Block discriminant type. */
  type: string
  /** The block's settings record (live — edits reflect immediately). */
  settings: Record<string, unknown>
  /** Optional nested blocks (for container block types). */
  blocks?: unknown[]
  /** Human-readable block name for the toolbar label. */
  name: string
  /** Whether this block is the selected one. */
  selected: boolean
  /** Position in the list — drives the move-up/down disabled bounds. */
  index: number
  /** Total block count — for the move-down bound. */
  total: number
}>()

const emit = defineEmits<{
  select: []
  remove: []
  move: [direction: 'up' | 'down']
}>()

const { t } = useI18n()

const blockComponent = computed(() => resolveBlock(props.type) ?? UnknownBlock)

function onActivate() {
  emit('select')
}

/**
 * Keyboard a11y on the shell:
 *  - Enter / Space → select (mirrors a click).
 *  - Alt+ArrowUp / Alt+ArrowDown → keyboard reorder (the drag fallback).
 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('select')
    return
  }
  if (e.altKey && e.key === 'ArrowUp') {
    e.preventDefault()
    emit('move', 'up')
    return
  }
  if (e.altKey && e.key === 'ArrowDown') {
    e.preventDefault()
    emit('move', 'down')
  }
}
</script>

<template>
  <div
    class="group/canvas-block relative outline-none"
    :class="selected
      ? 'ring-2 ring-primary ring-offset-2 ring-offset-default rounded'
      : 'hover:ring-1 hover:ring-primary/40 rounded'"
    role="button"
    tabindex="0"
    :aria-pressed="selected"
    :aria-label="t('admin.cms.visual.blockLabel', { name })"
    :data-testid="`canvas-block-${index}`"
    :data-cid="cid"
    :data-selected="selected ? 'true' : 'false'"
    @keydown="onKeydown"
  >
    <!--
      Capture layer: sits above the live block, owns the click so inner <a>/<button>
      never navigate while editing. The block below is `pointer-events-none`.
    -->
    <button
      type="button"
      class="absolute inset-0 z-10 cursor-pointer bg-transparent"
      :aria-label="t('admin.cms.visual.selectBlock', { name })"
      :data-testid="`canvas-select-${index}`"
      tabindex="-1"
      @click="onActivate"
    />

    <!-- Floating toolbar (top-right), visible on hover or when selected. -->
    <div
      class="absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-md border border-default bg-default/95 px-1 py-0.5 shadow-sm backdrop-blur transition-opacity"
      :class="selected ? 'opacity-100' : 'opacity-0 group-hover/canvas-block:opacity-100 focus-within:opacity-100'"
    >
      <span
        class="cms-canvas-drag-handle flex cursor-grab items-center px-1 text-muted hover:text-default"
        :aria-label="t('admin.cms.visual.dragHandle')"
        :title="t('admin.cms.visual.dragHint')"
      >
        <UIcon
          name="i-lucide-grip-vertical"
          class="size-4"
        />
      </span>
      <span class="max-w-32 truncate px-1 text-xs font-medium">{{ name }}</span>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-chevron-up"
        :disabled="index === 0"
        :aria-label="t('admin.cms.sections.moveUp')"
        @click="emit('move', 'up')"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-chevron-down"
        :disabled="index === total - 1"
        :aria-label="t('admin.cms.sections.moveDown')"
        @click="emit('move', 'down')"
      />
      <UButton
        color="error"
        variant="ghost"
        size="xs"
        icon="i-lucide-trash-2"
        :aria-label="t('admin.cms.sections.remove')"
        @click="emit('remove')"
      />
    </div>

    <!-- The live block — pointer-events disabled so the capture layer wins. -->
    <div class="pointer-events-none select-none">
      <BlockBoundary :type="type">
        <component
          :is="blockComponent"
          :type="type"
          :settings="settings"
          :blocks="blocks"
        />
      </BlockBoundary>
    </div>
  </div>
</template>
