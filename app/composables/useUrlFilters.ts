/**
 * Typed wrapper around `useRouteQuery` for filter state.
 *
 * Pass a Zod schema describing the filter shape plus default values. The
 * returned object is reactive: reads parse the URL query through the schema
 * (falling back to defaults on invalid input), writes serialise back via
 * `router.push` so back/forward navigation restores the previous filter
 * combination. Search inputs are debounced upstream by callers (e.g. 300 ms
 * `useDebounceFn`), which keeps the history clean.
 *
 * Empty strings serialise to `undefined` so URLs stay clean (no trailing
 * `?search=` after the user clears a filter).
 */

import { useRouteQuery } from '@vueuse/router'
import type { ComputedRef } from 'vue'
import type { z } from 'zod'

export type FilterValue = string | number | boolean | undefined | null

export function toQueryValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

export function fromQueryValue(raw: unknown, sample: unknown): FilterValue {
  if (raw === undefined || raw === null) return undefined
  const str = Array.isArray(raw) ? raw[0] : raw
  if (typeof str !== 'string' || str === '') return undefined
  if (typeof sample === 'boolean') {
    if (str === 'true') return true
    if (str === 'false') return false
    return undefined
  }
  if (typeof sample === 'number') {
    const n = Number(str)
    return Number.isFinite(n) ? n : undefined
  }
  return str
}

export function useUrlFilters<T extends Record<string, FilterValue>>(
  schema: z.ZodSchema<T>,
  defaults: T,
): {
  filters: ComputedRef<T>
  set: (patch: Partial<T>) => void
  reset: () => void
} {
  const router = useRouter()
  const route = useRoute()

  // One backing ref per known key so reads stay reactive.
  const refs = {} as Record<keyof T, ReturnType<typeof useRouteQuery>>
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    refs[key] = useRouteQuery(key as string)
  }

  const filters = computed<T>(() => {
    const raw = {} as Record<string, FilterValue>
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      raw[key as string] = fromQueryValue(refs[key].value, defaults[key])
    }
    const parsed = schema.safeParse(raw)
    return parsed.success ? parsed.data : defaults
  })

  // Patches whose navigation has not landed yet. `filters` reads the committed
  // route and `router.push` is async, so a second `set()` inside that window
  // (a select pick, then a search keystroke) would otherwise merge against the
  // stale query — and its push cancels the first one, writing the old value
  // back. Only the latest push clears it, landed or failed: after that the
  // route is the truth again.
  let pending: Partial<T> = {}

  // `push` (not `replace`) so back/forward navigation restores the previous
  // filter combination. Search input is upstream-debounced by the caller, so
  // we don't get one history entry per keystroke; selects update per-click
  // which is the desired granularity.
  const set = (patch: Partial<T>) => {
    pending = { ...pending, ...patch }
    const inFlight = pending
    const merged = { ...filters.value, ...pending }
    const query: Record<string, string | undefined> = {}
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const k = key as string
      const v = toQueryValue(merged[key])
      // Strip when value equals default to keep URLs short.
      query[k] = v === toQueryValue(defaults[key]) ? undefined : v
    }
    void router.push({
      query: { ...route.query, ...query },
    }).finally(() => {
      if (pending === inFlight) pending = {}
    })
  }

  // Every key back to its default, i.e. stripped from the URL — through `set`
  // so a `set()` issued before the reset lands does not undo it.
  const reset = () => set({ ...defaults })

  return { filters, set, reset }
}
