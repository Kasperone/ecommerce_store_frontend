import { describe, expect, it } from 'vitest'
import {
  draftSignature,
  makeSectionDraft,
  toDraftSections,
  toLayoutSections,
  usePageEditorState,
} from './usePageEditorState'

/**
 * Pure draft-state logic for the CMS editor — no Nuxt context needed.
 */

const heroLayout = [
  { type: 'hero', settings: { heading: 'Hi' } },
  { type: 'spacer', settings: { height: 48 } },
] as any

describe('toDraftSections / toLayoutSections', () => {
  it('assigns a stable client id to each section', () => {
    const drafts = toDraftSections(heroLayout)
    expect(drafts).toHaveLength(2)
    expect(drafts[0]!.__cid).toBeTruthy()
    expect(drafts[1]!.__cid).toBeTruthy()
    expect(drafts[0]!.__cid).not.toBe(drafts[1]!.__cid)
  })

  it('round-trips type + settings and drops the client id', () => {
    const drafts = toDraftSections(heroLayout)
    const layout = toLayoutSections(drafts) as any[]
    expect(layout[0]).toEqual({ type: 'hero', settings: { heading: 'Hi' } })
    expect(layout[0]).not.toHaveProperty('__cid')
  })

  it('preserves a backend section id when present', () => {
    const drafts = toDraftSections([{ id: 'srv-1', type: 'hero', settings: {} }] as any)
    const layout = toLayoutSections(drafts) as any[]
    expect(layout[0].id).toBe('srv-1')
  })

  it('treats null/undefined input as an empty list', () => {
    expect(toDraftSections(null)).toEqual([])
    expect(toDraftSections(undefined)).toEqual([])
  })
})

describe('draftSignature', () => {
  it('ignores client ids (same layout → same signature)', () => {
    const a = toDraftSections(heroLayout)
    const b = toDraftSections(heroLayout)
    expect(draftSignature(a)).toBe(draftSignature(b))
  })

  it('changes when settings change', () => {
    const a = toDraftSections(heroLayout)
    const sig1 = draftSignature(a)
    a[0]!.settings.heading = 'Changed'
    expect(draftSignature(a)).not.toBe(sig1)
  })
})

describe('usePageEditorState', () => {
  it('loads a layout, selects the first section, and is not dirty', () => {
    const s = usePageEditorState()
    s.load(heroLayout)
    expect(s.sections.value).toHaveLength(2)
    expect(s.selectedCid.value).toBe(s.sections.value[0]!.__cid)
    expect(s.isDirty.value).toBe(false)
  })

  it('becomes dirty after adding a section, clean after markSaved', () => {
    const s = usePageEditorState()
    s.load(heroLayout)
    s.addSection('rich-text', { body: '<p>x</p>' })
    expect(s.sections.value).toHaveLength(3)
    expect(s.isDirty.value).toBe(true)
    s.markSaved()
    expect(s.isDirty.value).toBe(false)
  })

  it('selects the newly added section', () => {
    const s = usePageEditorState()
    s.load(heroLayout)
    s.addSection('rich-text', {})
    expect(s.selectedSection.value?.type).toBe('rich-text')
  })

  it('removes a section and reselects a neighbour', () => {
    const s = usePageEditorState()
    s.load(heroLayout)
    const secondCid = s.sections.value[1]!.__cid
    s.removeSection(secondCid)
    expect(s.sections.value).toHaveLength(1)
    expect(s.sections.value.find(x => x.__cid === secondCid)).toBeUndefined()
  })

  it('moves a section up and down', () => {
    const s = usePageEditorState()
    s.load(heroLayout)
    const firstCid = s.sections.value[0]!.__cid
    s.moveSection(firstCid, 'down')
    expect(s.sections.value[1]!.__cid).toBe(firstCid)
    s.moveSection(firstCid, 'up')
    expect(s.sections.value[0]!.__cid).toBe(firstCid)
  })

  it('ignores a move past the list bounds', () => {
    const s = usePageEditorState()
    s.load(heroLayout)
    const firstCid = s.sections.value[0]!.__cid
    s.moveSection(firstCid, 'up')
    expect(s.sections.value[0]!.__cid).toBe(firstCid)
  })

  it('updates the selected section settings', () => {
    const s = usePageEditorState()
    s.load(heroLayout)
    s.updateSelectedSettings({ heading: 'New' })
    expect(s.selectedSection.value?.settings).toEqual({ heading: 'New' })
    expect(s.isDirty.value).toBe(true)
  })
})

describe('usePageEditorState — visual canvas mutators', () => {
  const threeLayout = [
    { type: 'hero', settings: {} },
    { type: 'spacer', settings: {} },
    { type: 'rich-text', settings: {} },
  ] as any

  it('reorder() applies an explicit cid order', () => {
    const s = usePageEditorState()
    s.load(threeLayout)
    const [a, b, c] = s.sections.value.map(x => x.__cid)
    s.reorder([c!, a!, b!])
    expect(s.sections.value.map(x => x.__cid)).toEqual([c, a, b])
    expect(s.isDirty.value).toBe(true)
  })

  it('reorder() never drops or duplicates on a partial/stale list', () => {
    const s = usePageEditorState()
    s.load(threeLayout)
    const [a, b, c] = s.sections.value.map(x => x.__cid)
    // Only b named, plus an unknown cid — a and c keep their order, appended.
    s.reorder([b!, 'ghost-cid'])
    expect(s.sections.value.map(x => x.__cid)).toEqual([b, a, c])
  })

  it('moveTo() moves a section to an explicit clamped index', () => {
    const s = usePageEditorState()
    s.load(threeLayout)
    const [a, , c] = s.sections.value.map(x => x.__cid)
    s.moveTo(a!, 99) // clamps to last
    expect(s.sections.value.at(-1)!.__cid).toBe(a)
    s.moveTo(a!, 0)
    expect(s.sections.value[0]!.__cid).toBe(a)
    // No-op when target equals current index.
    const before = s.sections.value.map(x => x.__cid)
    s.moveTo(c!, s.sections.value.findIndex(x => x.__cid === c))
    expect(s.sections.value.map(x => x.__cid)).toEqual(before)
  })

  it('addSectionAt() inserts at an explicit index and selects it', () => {
    const s = usePageEditorState()
    s.load(threeLayout)
    s.addSectionAt('faq', { foo: 1 }, 1)
    expect(s.sections.value).toHaveLength(4)
    expect(s.sections.value[1]!.type).toBe('faq')
    expect(s.selectedSection.value?.type).toBe('faq')
    expect(s.isDirty.value).toBe(true)
  })

  it('addSectionAt() clamps an out-of-range index to the end', () => {
    const s = usePageEditorState()
    s.load(threeLayout)
    s.addSectionAt('faq', {}, 99)
    expect(s.sections.value.at(-1)!.type).toBe('faq')
  })
})

describe('makeSectionDraft', () => {
  it('clones the settings object (no shared reference)', () => {
    const settings = { heading: 'A' }
    const draft = makeSectionDraft('hero', settings)
    draft.settings.heading = 'B'
    expect(settings.heading).toBe('A')
  })
})
