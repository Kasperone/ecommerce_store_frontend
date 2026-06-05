/**
 * Working-draft state for the CMS page editor.
 *
 * Holds the ordered list of `SectionDraft`s the admin is editing, plus dirty
 * tracking against the last-saved snapshot. Each draft section carries a stable
 * **client id** (`__cid`) so vuedraggable keys stay stable across reorders even
 * before the section has a backend-assigned `id`.
 *
 * Conversion helpers translate between the editor's `SectionDraft[]` and the
 * API's `PageLayout-Input.sections` array (the `*Section-Input` union members):
 *  - `toDraftSections` strips nothing; it assigns a `__cid` per section.
 *  - `toLayoutSections` emits `{ id?, type, settings, blocks? }` (the input shape).
 *
 * Pure logic, unit-testable in isolation (no Nuxt context required).
 */
import { computed, ref } from 'vue'
import type { SectionInput } from '~/composables/queries/usePageQueries'

/**
 * A nested child block within a container section (slideshow → slide,
 * faq → faq-item, image-gallery → image, collection-list → tile).
 *
 * Its `id` is a plain string the backend round-trips verbatim (e.g.
 * `SlideBlock.id: str | None`); we mint a `cid-…` value for admin-added
 * children and reuse it as the stable vuedraggable key.
 */
export interface ChildBlockDraft {
  type: string
  id: string
  settings: Record<string, unknown>
}

/** A section as edited in the builder: the API shape + a stable client id. */
export interface SectionDraft {
  /** Stable client id for list keying + selection (not sent to the backend). */
  __cid: string
  /** Backend-assigned section id (preserved on round-trip when present). */
  id?: string | null
  type: string
  settings: Record<string, unknown>
  blocks?: unknown[]
}

let cidCounter = 0
function nextCid(): string {
  cidCounter += 1
  return `cid-${cidCounter}-${Math.random().toString(36).slice(2, 8)}`
}

/** Read a section's children as a typed array, treating absent `blocks` as `[]`. */
function childBlocksOf(section: SectionDraft): ChildBlockDraft[] {
  return Array.isArray(section.blocks) ? (section.blocks as ChildBlockDraft[]) : []
}

/** Map API layout sections → editable drafts (assigns a client id to each). */
export function toDraftSections(sections: readonly SectionInput[] | null | undefined): SectionDraft[] {
  return (sections ?? []).map((s) => {
    const sec = s as Record<string, unknown>
    return {
      __cid: nextCid(),
      id: (sec.id as string | null | undefined) ?? null,
      type: String(sec.type),
      settings: { ...((sec.settings as Record<string, unknown>) ?? {}) },
      blocks: Array.isArray(sec.blocks) ? [...(sec.blocks as unknown[])] : undefined,
    }
  })
}

/** Map editable drafts → API layout sections (drops the client id). */
export function toLayoutSections(drafts: readonly SectionDraft[]): SectionInput[] {
  return drafts.map((d) => {
    const out: Record<string, unknown> = {
      type: d.type,
      settings: d.settings,
    }
    if (d.id) out.id = d.id
    if (d.blocks !== undefined) out.blocks = d.blocks
    return out as unknown as SectionInput
  })
}

/** Build a fresh draft section from an "Add section" pick. */
export function makeSectionDraft(type: string, settings: Record<string, unknown>): SectionDraft {
  return { __cid: nextCid(), id: null, type, settings: { ...settings } }
}

/** A stable string signature of the draft for cheap dirty comparison. */
export function draftSignature(drafts: readonly SectionDraft[]): string {
  return JSON.stringify(toLayoutSections(drafts))
}

export function usePageEditorState() {
  const sections = ref<SectionDraft[]>([])
  const selectedCid = ref<string | null>(null)
  // The signature of the last loaded/saved state — drives the dirty flag.
  const savedSignature = ref('')

  const isDirty = computed(() => draftSignature(sections.value) !== savedSignature.value)

  const selectedSection = computed<SectionDraft | null>(
    () => sections.value.find(s => s.__cid === selectedCid.value) ?? null,
  )

  /** Load a layout into the editor and reset the dirty baseline. */
  function load(layoutSections: readonly SectionInput[] | null | undefined) {
    sections.value = toDraftSections(layoutSections)
    savedSignature.value = draftSignature(sections.value)
    selectedCid.value = sections.value[0]?.__cid ?? null
  }

  /** Re-baseline the dirty flag after a successful save (layout unchanged). */
  function markSaved() {
    savedSignature.value = draftSignature(sections.value)
  }

  function addSection(type: string, settings: Record<string, unknown>) {
    const draft = makeSectionDraft(type, settings)
    sections.value = [...sections.value, draft]
    selectedCid.value = draft.__cid
  }

  function removeSection(cid: string) {
    const idx = sections.value.findIndex(s => s.__cid === cid)
    if (idx === -1) return
    sections.value = sections.value.filter(s => s.__cid !== cid)
    if (selectedCid.value === cid) {
      selectedCid.value = sections.value[Math.max(0, idx - 1)]?.__cid ?? null
    }
  }

  function moveSection(cid: string, direction: 'up' | 'down') {
    const idx = sections.value.findIndex(s => s.__cid === cid)
    if (idx === -1) return
    const target = direction === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= sections.value.length) return
    const next = [...sections.value]
    const [moved] = next.splice(idx, 1)
    next.splice(target, 0, moved!)
    sections.value = next
  }

  /**
   * Reorder the draft to match an explicit list of client ids — the array-level
   * reorder the visual canvas needs (vuedraggable yields a fully reordered list,
   * not an up/down delta). Cids absent from `orderedCids` keep their relative
   * order appended at the end, and unknown cids are ignored, so a partial or
   * stale list can never drop or duplicate a section. Additive: existing
   * `moveSection` consumers are untouched.
   */
  function reorder(orderedCids: readonly string[]) {
    const byCid = new Map(sections.value.map(s => [s.__cid, s]))
    const next: SectionDraft[] = []
    const seen = new Set<string>()
    for (const cid of orderedCids) {
      const sec = byCid.get(cid)
      if (sec && !seen.has(cid)) {
        next.push(sec)
        seen.add(cid)
      }
    }
    // Preserve any section not named in `orderedCids` (defensive — same order).
    for (const sec of sections.value) {
      if (!seen.has(sec.__cid)) next.push(sec)
    }
    sections.value = next
  }

  /**
   * Move a single section to an explicit target index — the canvas's keyboard
   * reorder + drop-onto-index helper. Index is clamped to the valid range.
   */
  function moveTo(cid: string, index: number) {
    const from = sections.value.findIndex(s => s.__cid === cid)
    if (from === -1) return
    const to = Math.max(0, Math.min(index, sections.value.length - 1))
    if (to === from) return
    const next = [...sections.value]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    sections.value = next
  }

  /**
   * Insert a fresh draft section at an explicit index (the canvas drop-zones
   * insert between blocks, not only append like `addSection`). Selects the new
   * section. Index is clamped to `[0, length]`.
   */
  function addSectionAt(type: string, settings: Record<string, unknown>, index: number) {
    const draft = makeSectionDraft(type, settings)
    const at = Math.max(0, Math.min(index, sections.value.length))
    const next = [...sections.value]
    next.splice(at, 0, draft)
    sections.value = next
    selectedCid.value = draft.__cid
  }

  /** Patch the selected section's settings record. */
  function updateSelectedSettings(settings: Record<string, unknown>) {
    if (!selectedSection.value) return
    sections.value = sections.value.map(s =>
      s.__cid === selectedCid.value ? { ...s, settings } : s,
    )
  }

  // ---- Child-block (nested) mutators ------------------------------------- //
  // All operate on the SELECTED container section, treat a missing `blocks`
  // array as `[]`, and replace the section object IMMUTABLY (spread) so the
  // `draftSignature` (which serializes `blocks`) flips `isDirty` for free.

  /**
   * Replace the selected section's `blocks` with `next`, immutably. The new
   * `selectedChildId` (if any) is returned to the caller — child selection
   * state lives in the sub-editor component, not here.
   */
  function replaceSelectedBlocks(next: ChildBlockDraft[]) {
    if (!selectedSection.value) return
    sections.value = sections.value.map(s =>
      s.__cid === selectedCid.value ? { ...s, blocks: next } : s,
    )
  }

  /**
   * Append a fresh child block of `childType` with the given starter settings,
   * minting a `cid-…` id. Returns the new child's id so the caller can select it.
   */
  function addChildBlock(childType: string, settings: Record<string, unknown>): string | undefined {
    if (!selectedSection.value) return undefined
    const child: ChildBlockDraft = { type: childType, id: nextCid(), settings: { ...settings } }
    replaceSelectedBlocks([...childBlocksOf(selectedSection.value), child])
    return child.id
  }

  /** Drop a child by its id. */
  function removeChildBlock(childId: string) {
    if (!selectedSection.value) return
    replaceSelectedBlocks(childBlocksOf(selectedSection.value).filter(c => c.id !== childId))
  }

  /** Move a child up or down by one, clamped to the list bounds. */
  function moveChildBlock(childId: string, direction: 'up' | 'down') {
    if (!selectedSection.value) return
    const current = childBlocksOf(selectedSection.value)
    const idx = current.findIndex(c => c.id === childId)
    if (idx === -1) return
    const target = direction === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= current.length) return
    const next = [...current]
    const [moved] = next.splice(idx, 1)
    next.splice(target, 0, moved!)
    replaceSelectedBlocks(next)
  }

  /**
   * Reorder the selected section's children to match an explicit id order
   * (vuedraggable yields a fully reordered list). Ids absent from `orderedIds`
   * keep their relative order appended at the end; unknown ids are ignored — a
   * partial/stale list can never drop or duplicate a child.
   */
  function reorderChildBlocks(orderedIds: readonly string[]) {
    if (!selectedSection.value) return
    const current = childBlocksOf(selectedSection.value)
    const byId = new Map(current.map(c => [c.id, c]))
    const next: ChildBlockDraft[] = []
    const seen = new Set<string>()
    for (const id of orderedIds) {
      const child = byId.get(id)
      if (child && !seen.has(id)) {
        next.push(child)
        seen.add(id)
      }
    }
    for (const child of current) {
      if (!seen.has(child.id)) next.push(child)
    }
    replaceSelectedBlocks(next)
  }

  /** Patch a single child's settings record. */
  function updateChildSettings(childId: string, settings: Record<string, unknown>) {
    if (!selectedSection.value) return
    replaceSelectedBlocks(
      childBlocksOf(selectedSection.value).map(c =>
        c.id === childId ? { ...c, settings } : c,
      ),
    )
  }

  return {
    sections,
    selectedCid,
    selectedSection,
    isDirty,
    load,
    markSaved,
    addSection,
    addSectionAt,
    removeSection,
    moveSection,
    reorder,
    moveTo,
    updateSelectedSettings,
    addChildBlock,
    removeChildBlock,
    moveChildBlock,
    reorderChildBlocks,
    updateChildSettings,
  }
}
