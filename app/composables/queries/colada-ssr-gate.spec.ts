import { describe, expect, it } from 'vitest'

/**
 * Guard: every `useQuery(...)` must be client-only.
 *
 * `@pinia/colada`'s cache is NOT serialized across SSR (see `app/plugins/
 * colada.ts`). So any query that runs on the server renders data the client
 * can't reproduce on its first paint → "Hydration completed but contains
 * mismatches" on every hard reload. The codebase convention is that each query
 * gates `enabled: () => import.meta.client` (composing with any other
 * condition, e.g. `&& toValue(id) !== undefined`); the public catalog uses
 * `useAsyncData` for SSR/SEO instead.
 *
 * This test enforces that convention mechanically so a new query can't silently
 * reintroduce the mismatch. If a query genuinely must run on the server, add the
 * marker comment `colada-ssr-gate-allow-ssr` inside its options object.
 */

// Raw source of every app file, scanned statically (no imports executed).
const sources = import.meta.glob('../../**/*.{ts,vue}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const ALLOW_MARKER = 'colada-ssr-gate-allow-ssr'

/** Find each `useQuery({ ... })` block and report any missing the client gate. */
function ungatedQueryBlocks(path: string, src: string): string[] {
  const offenders: string[] = []
  let from = 0
  for (;;) {
    const call = src.indexOf('useQuery(', from)
    if (call === -1) break
    const open = src.indexOf('{', call)
    if (open === -1 || open > call + 3) {
      // `useQuery(` not immediately followed by an object literal — skip.
      from = call + 'useQuery('.length
      continue
    }
    // Brace-match to the end of the options object.
    let depth = 0
    let end = open
    for (; end < src.length; end++) {
      const ch = src[end]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) break
      }
    }
    const block = src.slice(open, end + 1)
    const gated = block.includes('import.meta.client') || block.includes(ALLOW_MARKER)
    if (!gated) {
      const line = src.slice(0, call).split('\n').length
      offenders.push(`${path}:${line}`)
    }
    from = end + 1
  }
  return offenders
}

describe('@pinia/colada SSR client-only gate', () => {
  const scanned = Object.entries(sources).filter(
    ([path]) => !path.endsWith('.spec.ts') && !path.endsWith('.test.ts'),
  )
  const queryFiles = scanned.filter(([, src]) => src.includes('useQuery('))
  const offenders = scanned.flatMap(([path, src]) => ungatedQueryBlocks(path, src))

  it('scans the real source tree (glob is wired up)', () => {
    // Sanity floor: if the glob ever resolves to nothing the gate check would
    // pass vacuously. We currently have ~29 query composables.
    expect(scanned.length).toBeGreaterThan(50)
    expect(queryFiles.length).toBeGreaterThan(15)
  })

  it('every useQuery is client-only (enabled: () => import.meta.client)', () => {
    // On failure Vitest prints `offenders` (each `path:line`). Fix by adding
    // `enabled: () => import.meta.client` to the query — or the
    // `colada-ssr-gate-allow-ssr` marker inside its options if SSR is intended.
    expect(offenders).toEqual([])
  })
})
