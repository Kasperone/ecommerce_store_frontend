// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VisualCanvas from './VisualCanvas.vue'
import type { SectionDraft } from '~/composables/usePageEditorState'

/**
 * The visual WYSIWYG canvas. We assert: one canvas-block per section, the
 * select/move/remove pass-through, the insert drop-zones (between/after blocks),
 * the empty state, and the reorder event shape (drag physics are vuedraggable's
 * concern — we assert the v-model write maps to a `reorder(cidOrder)` emit).
 */

function drafts(): SectionDraft[] {
  return [
    { __cid: 'a', type: 'hero', settings: { heading: 'Top' } },
    { __cid: 'b', type: 'spacer', settings: {} },
    { __cid: 'c', type: 'rich-text', settings: { heading: 'Story' } },
  ]
}

const typeNames = { 'hero': 'Hero', 'spacer': 'Spacer', 'rich-text': 'Rich text' }

function mountCanvas(selectedCid: string | null = 'a', sections = drafts()) {
  return mountSuspended(VisualCanvas, {
    props: { sections, selectedCid, typeNames },
  })
}

describe('VisualCanvas', () => {
  it('renders one canvas block per section', async () => {
    const w = await mountCanvas()
    expect(w.find('[data-testid="canvas-block-0"]').exists()).toBe(true)
    expect(w.find('[data-testid="canvas-block-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="canvas-block-2"]').exists()).toBe(true)
  })

  it('renders a leading drop-zone and one after each block', async () => {
    const w = await mountCanvas()
    // dropzone-0 (top), dropzone-1, dropzone-2, dropzone-3 (after last).
    expect(w.find('[data-testid="dropzone-0"]').exists()).toBe(true)
    expect(w.find('[data-testid="dropzone-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="dropzone-3"]').exists()).toBe(true)
  })

  it('emits add-at with the leading index from the top drop-zone', async () => {
    const w = await mountCanvas()
    await w.find('[data-testid="dropzone-0"]').trigger('click')
    expect(w.emitted('add-at')?.at(-1)).toEqual([0])
  })

  it('emits add-at with index+1 from a between-block drop-zone', async () => {
    const w = await mountCanvas()
    await w.find('[data-testid="dropzone-2"]').trigger('click')
    expect(w.emitted('add-at')?.at(-1)).toEqual([2])
  })

  it('emits select with the section cid when a block is activated', async () => {
    const w = await mountCanvas()
    await w.find('[data-testid="canvas-select-1"]').trigger('click')
    expect(w.emitted('select')?.at(-1)).toEqual(['b'])
  })

  it('emits move with the cid + direction from a block toolbar', async () => {
    const w = await mountCanvas()
    const block1 = w.find('[data-testid="canvas-block-1"]')
    await block1.find('button[aria-label="Move up"]').trigger('click')
    expect(w.emitted('move')?.at(-1)).toEqual([{ cid: 'b', direction: 'up' }])
  })

  it('emits remove with the cid from a block toolbar', async () => {
    const w = await mountCanvas()
    const block0 = w.find('[data-testid="canvas-block-0"]')
    await block0.find('button[aria-label="Remove section"]').trigger('click')
    expect(w.emitted('remove')?.at(-1)).toEqual(['a'])
  })

  it('marks the selected block on the canvas', async () => {
    const w = await mountCanvas('b')
    expect(w.find('[data-testid="canvas-block-1"]').attributes('data-selected')).toBe('true')
    expect(w.find('[data-testid="canvas-block-0"]').attributes('data-selected')).toBe('false')
  })

  it('shows the empty state when there are no sections', async () => {
    const w = await mountCanvas(null, [])
    expect(w.find('[data-testid="visual-canvas-empty"]').exists()).toBe(true)
    // The leading drop-zone is still offered so the admin can insert the first block.
    expect(w.find('[data-testid="dropzone-0"]').exists()).toBe(true)
  })

  it('emits reorder with the new cid order when the draggable list is written', async () => {
    const w = await mountCanvas()
    // Simulate vuedraggable committing a reordered list via the v-model setter.
    const reordered: SectionDraft[] = [drafts()[2]!, drafts()[0]!, drafts()[1]!]
    w.findComponent({ name: 'draggable' }).vm.$emit('update:modelValue', reordered)
    await w.vm.$nextTick()
    expect(w.emitted('reorder')?.at(-1)).toEqual([['c', 'a', 'b']])
  })
})
