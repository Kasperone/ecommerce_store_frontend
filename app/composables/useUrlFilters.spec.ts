// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { z } from 'zod'
import { fromQueryValue, toQueryValue, useUrlFilters } from './useUrlFilters'

// A route whose query only changes when the test lands a navigation, and a
// `push` that stays pending until then — the gap a real `router.push` has
// while its guards run. Module-scope reactive state + lazy factories (see the
// hoisting rule in .claude/rules/testing.md).
type Query = Record<string, string | undefined>
const route = reactive<{ query: Query }>({ query: {} })
const pushes: Array<{ query: Query, land: () => void, cancel: () => void }> = []
const mockPush = vi.fn((to: { query: Query }) => new Promise<unknown>((resolve) => {
  pushes.push({
    query: to.query,
    land: () => {
      route.query = Object.fromEntries(Object.entries(to.query).filter(([, v]) => v !== undefined))
      resolve(undefined)
    },
    // vue-router resolves (not rejects) a superseded push with a NavigationFailure.
    cancel: () => resolve(new Error('Navigation cancelled')),
  })
}))

mockNuxtImport('useRoute', () => () => route)
mockNuxtImport('useRouter', (original: () => object) => () => new Proxy(original(), {
  get: (target, prop, receiver) => prop === 'push' ? mockPush : Reflect.get(target, prop, receiver),
}))
vi.mock('@vueuse/router', () => ({
  useRouteQuery: (key: string) => computed(() => route.query[key]),
}))

/** Let the settled push's `.finally` bookkeeping run. */
const flush = () => new Promise(r => setTimeout(r, 0))

describe('toQueryValue', () => {
  it('returns undefined for nullish or empty values', () => {
    expect(toQueryValue(undefined)).toBeUndefined()
    expect(toQueryValue(null)).toBeUndefined()
    expect(toQueryValue('')).toBeUndefined()
  })

  it('serialises booleans as true/false strings', () => {
    expect(toQueryValue(true)).toBe('true')
    expect(toQueryValue(false)).toBe('false')
  })

  it('serialises numbers and strings via String()', () => {
    expect(toQueryValue(42)).toBe('42')
    expect(toQueryValue('search term')).toBe('search term')
  })
})

describe('fromQueryValue', () => {
  it('returns undefined for missing or empty raw inputs', () => {
    expect(fromQueryValue(undefined, '')).toBeUndefined()
    expect(fromQueryValue(null, '')).toBeUndefined()
    expect(fromQueryValue('', '')).toBeUndefined()
  })

  it('parses booleans when the sample is boolean', () => {
    expect(fromQueryValue('true', false)).toBe(true)
    expect(fromQueryValue('false', false)).toBe(false)
    expect(fromQueryValue('yes', false)).toBeUndefined()
  })

  it('parses numbers when the sample is numeric', () => {
    expect(fromQueryValue('42', 0)).toBe(42)
    expect(fromQueryValue('not-a-number', 0)).toBeUndefined()
  })

  it('returns the string as-is for string samples', () => {
    expect(fromQueryValue('foo', '')).toBe('foo')
  })

  it('handles array query values by taking the first entry (vue-router quirk)', () => {
    expect(fromQueryValue(['first', 'second'], '')).toBe('first')
  })
})

describe('useUrlFilters set()', () => {
  const schema = z.object({
    status: z.enum(['all', 'approved']).optional(),
    rating: z.enum(['all', '2', '5']).optional(),
    search: z.string().optional(),
    page: z.number().optional(),
  })
  const defaults = { status: 'all' as const, rating: 'all' as const, search: undefined as string | undefined, page: 1 }

  beforeEach(() => {
    route.query = { rating: '2' }
    pushes.length = 0
    mockPush.mockClear()
  })

  it('keeps a pick whose navigation is still in flight when the next set() lands', async () => {
    const { set } = useUrlFilters(schema, defaults)
    set({ rating: 'all', page: 1 }) // a select pick…
    set({ search: 'zzz', page: 1 }) // …then a search keystroke before it lands

    // The second push must not write the stale `rating=2` back.
    expect(pushes[1]!.query).toMatchObject({ rating: undefined, search: 'zzz' })
    pushes[0]!.cancel() // vue-router: superseded by the newer push
    pushes[1]!.land()
    await flush()
    expect(route.query).toEqual({ search: 'zzz' })
  })

  it('a superseded push settling does not drop the newer patch', async () => {
    const { set } = useUrlFilters(schema, defaults)
    set({ rating: 'all' })
    set({ search: 'zzz' })
    pushes[0]!.cancel() // settles first; the second is still in flight
    await flush()

    set({ status: 'approved' })
    expect(pushes[2]!.query).toMatchObject({ rating: undefined, search: 'zzz', status: 'approved' })
  })

  it('merges from the route again once its navigation has landed', async () => {
    const { set } = useUrlFilters(schema, defaults)
    set({ rating: 'all' })
    pushes[0]!.land()
    await flush()

    // Back/forward (or a link) moves the route afterwards: the next set()
    // must build on that, not on the already-landed patch.
    route.query = { rating: '5' }
    set({ status: 'approved' })
    expect(pushes[1]!.query).toMatchObject({ rating: '5', status: 'approved' })
  })

  it('drops a patch whose navigation failed, so the route stays the truth', async () => {
    const { set } = useUrlFilters(schema, defaults)
    set({ rating: 'all' })
    pushes[0]!.cancel() // e.g. aborted by a guard
    await flush()

    set({ search: 'zzz' })
    expect(pushes[1]!.query).toMatchObject({ rating: '2', search: 'zzz' })
  })

  it('reset() is not undone by a set() issued before it lands', async () => {
    route.query = { rating: '2', search: 'old' }
    const { set, reset } = useUrlFilters(schema, defaults)
    reset()
    set({ status: 'approved' })
    expect(pushes[1]!.query).toMatchObject({ rating: undefined, search: undefined, status: 'approved' })
  })
})
