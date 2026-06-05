// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SubBlockList from './SubBlockList.vue'
import type { ChildBlockDraft } from '~/composables/usePageEditorState'
import type { BlockChildSchema } from '~/composables/queries/usePageQueries'

/**
 * The nested sub-block editor (vuedraggable). We assert the rendered rows, the
 * add/select/remove/move event contract, the empty state, and that selecting a
 * child reveals its (reused) settings form. Drag physics are vuedraggable's own
 * concern; the keyboard move buttons give a deterministic reorder path.
 */

const childSchemas: Record<string, BlockChildSchema> = {
  slide: {
    name: 'Slide',
    settings: [{ type: 'text', id: 'heading', label: 'Heading' }],
  },
}

function children(): ChildBlockDraft[] {
  return [
    { type: 'slide', id: 's0', settings: { heading: 'First' } },
    { type: 'slide', id: 's1', settings: { heading: 'Second' } },
  ]
}

async function mountSub(selectedChildId: string | null = null) {
  return mountSuspended(SubBlockList, {
    props: { modelValue: children(), childSchemas, selectedChildId },
  })
}

describe('SubBlockList', () => {
  it('renders one row per child with its schema name', async () => {
    const w = await mountSub()
    expect(w.find('[data-testid="sub-block-row-0"]').exists()).toBe(true)
    expect(w.find('[data-testid="sub-block-row-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="sub-block-row-2"]').exists()).toBe(false)
    expect(w.text()).toContain('Slide')
  })

  it('shows a preview label from the child heading', async () => {
    const w = await mountSub()
    expect(w.text()).toContain('First')
    expect(w.text()).toContain('Second')
  })

  it('emits add with the (single) child type when Add is clicked', async () => {
    const w = await mountSub()
    await w.find('[data-testid="sub-block-add"]').trigger('click')
    expect(w.emitted('add')?.at(-1)).toEqual(['slide'])
  })

  it('emits select with the child id when a row is clicked', async () => {
    const w = await mountSub()
    await w.find('[data-testid="sub-block-row-1"]').find('button.flex-1').trigger('click')
    expect(w.emitted('select')?.at(-1)).toEqual(['s1'])
  })

  it('emits move up/down from the chevron buttons', async () => {
    const w = await mountSub()
    // Last row → Move up is enabled.
    await w.find('[data-testid="sub-block-row-1"]').find('button[aria-label="Move up"]').trigger('click')
    expect(w.emitted('move')?.at(-1)).toEqual([{ id: 's1', direction: 'up' }])
    // First row → Move down is enabled.
    await w.find('[data-testid="sub-block-row-0"]').find('button[aria-label="Move down"]').trigger('click')
    expect(w.emitted('move')?.at(-1)).toEqual([{ id: 's0', direction: 'down' }])
  })

  it('emits remove from the trash button', async () => {
    const w = await mountSub()
    await w.find('[data-testid="sub-block-row-0"]').find('button[aria-label="Remove item"]').trigger('click')
    expect(w.emitted('remove')?.at(-1)).toEqual(['s0'])
  })

  it('disables move-up on the first child and move-down on the last', async () => {
    const w = await mountSub()
    const first = w.find('[data-testid="sub-block-row-0"]')
    const last = w.find('[data-testid="sub-block-row-1"]')
    expect(first.find('button[aria-label="Move up"]').attributes('disabled')).toBeDefined()
    expect(last.find('button[aria-label="Move down"]').attributes('disabled')).toBeDefined()
  })

  it('reveals the settings form only for the selected child', async () => {
    const unselected = await mountSub(null)
    expect(unselected.find('[data-testid="sub-block-settings-0"]').exists()).toBe(false)

    const selected = await mountSub('s0')
    expect(selected.find('[data-testid="sub-block-settings-0"]').exists()).toBe(true)
    expect(selected.find('[data-testid="sub-block-settings-1"]').exists()).toBe(false)
    // The reused settings form renders the child's "Heading" field.
    expect(selected.find('[data-testid="sub-block-settings-0"]').text()).toContain('Heading')
  })

  it('shows the empty state with no children', async () => {
    const w = await mountSuspended(SubBlockList, {
      props: { modelValue: [], childSchemas, selectedChildId: null },
    })
    expect(w.text()).toContain('No items yet')
    expect(w.find('[data-testid="sub-block-row-0"]').exists()).toBe(false)
  })
})
