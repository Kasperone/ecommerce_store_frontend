// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AddSectionModal from './AddSectionModal.vue'
import type { BlockSchema } from '~/composables/queries/usePageQueries'

/**
 * The "Add section" preset picker. Each preset becomes a clickable card that
 * emits a normalised section input. Cases are split into individual `it()`
 * blocks (UModal teleports to body).
 */

const schemas: BlockSchema[] = [
  {
    type: 'hero',
    name: 'Hero',
    settings: [],
    presets: [{ name: 'Hero', settings: { heading: 'Welcome' } }],
  },
  {
    type: 'promo-strip',
    name: 'Promo strip',
    settings: [],
    presets: [{ name: 'Promo strip', settings: { text: 'Free shipping' } }],
  },
  {
    // A block with no presets still offers one empty card.
    type: 'spacer',
    name: 'Spacer',
    settings: [],
  },
]

describe('AddSectionModal', () => {
  let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null

  async function open() {
    wrapper = await mountSuspended(AddSectionModal, { props: { open: true, schemas } })
    return wrapper
  }

  // Unmount + clear teleported scaffolding so a stale modal's cards don't leak
  // into the next test's `document.body` query.
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  function clickCard(match: string) {
    const cards = [...document.querySelectorAll('li button')] as HTMLButtonElement[]
    const card = cards.find(b => b.textContent?.includes(match))!
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }

  it('renders a card for each preset', async () => {
    await open()
    const body = document.body.textContent ?? ''
    expect(body).toContain('Hero')
    expect(body).toContain('Promo strip')
    expect(body).toContain('Spacer')
  })

  it('emits pick with the preset settings when a card is clicked', async () => {
    const w = await open()
    clickCard('Hero')
    await new Promise(r => setTimeout(r, 0))
    const picked = w.emitted('pick')?.at(-1)?.[0]
    expect(picked).toMatchObject({ type: 'hero', settings: { heading: 'Welcome' } })
  })

  it('emits an empty-settings section for a preset-less block', async () => {
    const w = await open()
    clickCard('Spacer')
    await new Promise(r => setTimeout(r, 0))
    expect(w.emitted('pick')?.at(-1)?.[0]).toEqual({ type: 'spacer', settings: {} })
  })

  it('closes the modal after a pick (update:open false)', async () => {
    const w = await open()
    clickCard('Hero')
    await new Promise(r => setTimeout(r, 0))
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
  })
})
