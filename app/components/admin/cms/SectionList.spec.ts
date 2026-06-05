// @vitest-environment nuxt
import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SectionList from './SectionList.vue'
import type { SectionDraft } from '~/composables/usePageEditorState'

/**
 * The reorderable section list (vuedraggable). We assert the rendered rows, the
 * select/remove/move event contract, and the move-button disabled bounds. Drag
 * physics are vuedraggable's own concern; the keyboard move buttons give us a
 * deterministic, a11y-friendly reorder path to test.
 */

function drafts(): SectionDraft[] {
  return [
    { __cid: 'a', type: 'hero', settings: { heading: 'Top' } },
    { __cid: 'b', type: 'spacer', settings: {} },
    { __cid: 'c', type: 'rich-text', settings: { heading: 'Story' } },
  ]
}

const typeNames = { 'hero': 'Hero', 'spacer': 'Spacer', 'rich-text': 'Rich text' }

async function mountList(selectedId: string | null = 'a') {
  return mountSuspended(SectionList, {
    props: { modelValue: drafts(), selectedId, typeNames },
  })
}

describe('SectionList', () => {
  it('renders one row per section with its block name', async () => {
    const w = await mountList()
    expect(w.find('[data-testid="section-row-0"]').exists()).toBe(true)
    expect(w.find('[data-testid="section-row-2"]').exists()).toBe(true)
    expect(w.text()).toContain('Hero')
    expect(w.text()).toContain('Rich text')
  })

  it('shows a settings preview label from the heading', async () => {
    const w = await mountList()
    expect(w.text()).toContain('Top')
    expect(w.text()).toContain('Story')
  })

  it('emits select with the section id when a row is clicked', async () => {
    const w = await mountList()
    const row1 = w.find('[data-testid="section-row-1"]')
    await row1.find('button.flex-1').trigger('click')
    expect(w.emitted('select')?.at(-1)).toEqual(['b'])
  })

  it('emits move up/down from the chevron buttons', async () => {
    const w = await mountList()
    const row1 = w.find('[data-testid="section-row-1"]')
    const buttons = row1.findAll('button')
    // [drag-handle, label, up, down, delete]
    await buttons.find(b => b.attributes('aria-label') === 'Move up')!.trigger('click')
    expect(w.emitted('move')?.at(-1)).toEqual([{ id: 'b', direction: 'up' }])
    await buttons.find(b => b.attributes('aria-label') === 'Move down')!.trigger('click')
    expect(w.emitted('move')?.at(-1)).toEqual([{ id: 'b', direction: 'down' }])
  })

  it('emits remove from the trash button', async () => {
    const w = await mountList()
    const row0 = w.find('[data-testid="section-row-0"]')
    await row0.find('button[aria-label="Remove section"]').trigger('click')
    expect(w.emitted('remove')?.at(-1)).toEqual(['a'])
  })

  it('disables move-up on the first row and move-down on the last', async () => {
    const w = await mountList()
    const first = w.find('[data-testid="section-row-0"]')
    const last = w.find('[data-testid="section-row-2"]')
    expect(first.find('button[aria-label="Move up"]').attributes('disabled')).toBeDefined()
    expect(last.find('button[aria-label="Move down"]').attributes('disabled')).toBeDefined()
  })

  it('shows an empty message when there are no sections', async () => {
    const w = await mountSuspended(SectionList, {
      props: { modelValue: [], selectedId: null, typeNames },
    })
    expect(w.text()).toContain('No sections yet')
  })
})
