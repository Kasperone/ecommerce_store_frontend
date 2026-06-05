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

  /** Patch the selected section's settings record. */
  function updateSelectedSettings(settings: Record<string, unknown>) {
    if (!selectedSection.value) return
    sections.value = sections.value.map(s =>
      s.__cid === selectedCid.value ? { ...s, settings } : s,
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
    removeSection,
    moveSection,
    updateSelectedSettings,
  }
}
