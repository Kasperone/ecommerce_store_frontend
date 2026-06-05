// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import VisualCanvasBlock from './VisualCanvasBlock.vue'

/**
 * The per-block overlay shell on the visual canvas. We assert the select/move/
 * remove event contract, the capture layer (so inner links don't navigate), the
 * keyboard a11y (Enter selects, Alt+Arrow reorders), and the move-bound disabling.
 * Cases are split into individual `it()` blocks.
 */

function mountBlock(overrides: Record<string, unknown> = {}) {
  return mountSuspended(VisualCanvasBlock, {
    props: {
      cid: 'c1',
      type: 'spacer',
      settings: {},
      name: 'Spacer',
      selected: false,
      index: 1,
      total: 3,
      ...overrides,
    },
  })
}

describe('VisualCanvasBlock', () => {
  it('renders a focusable selectable shell labelled by the block name', async () => {
    const w = await mountBlock()
    const shell = w.find('[data-testid="canvas-block-1"]')
    expect(shell.exists()).toBe(true)
    expect(shell.attributes('role')).toBe('button')
    expect(shell.attributes('tabindex')).toBe('0')
    expect(shell.attributes('aria-label')).toContain('Spacer')
  })

  it('emits select when the capture layer is clicked', async () => {
    const w = await mountBlock()
    await w.find('[data-testid="canvas-select-1"]').trigger('click')
    expect(w.emitted('select')).toHaveLength(1)
  })

  it('renders the live block under a pointer-events-none layer (no inner navigation)', async () => {
    const w = await mountBlock()
    // The block wrapper disables pointer events so the capture layer owns clicks.
    expect(w.find('.pointer-events-none').exists()).toBe(true)
    // The capture button sits above (z-10) the block.
    expect(w.find('[data-testid="canvas-select-1"]').classes()).toContain('z-10')
  })

  it('shows the selection ring only when selected', async () => {
    const unselected = await mountBlock({ selected: false })
    expect(unselected.find('[data-testid="canvas-block-1"]').attributes('data-selected')).toBe('false')
    const selected = await mountBlock({ selected: true })
    const shell = selected.find('[data-testid="canvas-block-1"]')
    expect(shell.attributes('data-selected')).toBe('true')
    expect(shell.attributes('aria-pressed')).toBe('true')
    expect(shell.classes().join(' ')).toContain('ring-primary')
  })

  it('emits move up/down from the toolbar chevrons', async () => {
    const w = await mountBlock()
    const up = w.find('button[aria-label="Move up"]')
    const down = w.find('button[aria-label="Move down"]')
    await up.trigger('click')
    expect(w.emitted('move')?.at(-1)).toEqual(['up'])
    await down.trigger('click')
    expect(w.emitted('move')?.at(-1)).toEqual(['down'])
  })

  it('emits remove from the toolbar trash button', async () => {
    const w = await mountBlock()
    await w.find('button[aria-label="Remove section"]').trigger('click')
    expect(w.emitted('remove')).toHaveLength(1)
  })

  it('disables move-up on the first block and move-down on the last', async () => {
    const first = await mountBlock({ index: 0, total: 3 })
    expect(first.find('button[aria-label="Move up"]').attributes('disabled')).toBeDefined()
    const last = await mountBlock({ index: 2, total: 3 })
    expect(last.find('button[aria-label="Move down"]').attributes('disabled')).toBeDefined()
  })

  it('selects on Enter key', async () => {
    const w = await mountBlock()
    await w.find('[data-testid="canvas-block-1"]').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('select')).toHaveLength(1)
  })

  it('reorders with Alt+ArrowUp / Alt+ArrowDown (drag keyboard fallback)', async () => {
    const w = await mountBlock()
    const shell = w.find('[data-testid="canvas-block-1"]')
    await shell.trigger('keydown', { key: 'ArrowUp', altKey: true })
    expect(w.emitted('move')?.at(-1)).toEqual(['up'])
    await shell.trigger('keydown', { key: 'ArrowDown', altKey: true })
    expect(w.emitted('move')?.at(-1)).toEqual(['down'])
  })

  it('does not reorder on a bare ArrowUp without Alt', async () => {
    const w = await mountBlock()
    await w.find('[data-testid="canvas-block-1"]').trigger('keydown', { key: 'ArrowUp' })
    expect(w.emitted('move')).toBeUndefined()
  })
})
