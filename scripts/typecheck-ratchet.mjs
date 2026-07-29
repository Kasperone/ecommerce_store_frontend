#!/usr/bin/env node
/**
 * Type-check ratchet.
 *
 * The frontend had never been type-checked, so turning `nuxt typecheck` into a
 * plain CI gate would have meant fixing ~580 pre-existing errors before anything
 * could go green. Instead this compares the current run against a committed
 * per-file baseline and fails only when a file gets *worse* — so the gate is
 * green from day one while still catching new mistakes.
 *
 * Why per-file counts rather than the raw error list: line and column numbers
 * shift under every unrelated edit, so a positional baseline would produce
 * constant false failures. A count per file is stable against edits that don't
 * change how many errors a file has.
 *
 *   npm run typecheck          # raw `nuxt typecheck`, all errors, human-readable
 *   npm run typecheck:ci       # the gate CI runs
 *   npm run typecheck:ci -- --update   # re-record the baseline after fixing some
 *
 * Burning the backlog down is the point: fix errors in a file, re-run with
 * --update, and the ratchet locks the improvement in. See
 * the project-root notes: .claude/notes/plans/qa/pending/2026-07-29-frontend-typecheck-backlog.md.
 */

import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import process from 'node:process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = join(ROOT, 'typecheck-baseline.json')
const UPDATE = process.argv.includes('--update')

// `path/to/file.vue(12,34): error TS2322: ...`
const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+):/

function runTypecheck() {
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['nuxt', 'typecheck'],
      { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 },
      (_err, stdout, stderr) => resolve(`${stdout}\n${stderr}`),
    )
  })
}

function countsByFile(output) {
  const counts = {}
  for (const line of output.split('\n')) {
    const match = ERROR_LINE.exec(line.trim())
    if (!match) continue
    const file = match[1]
    counts[file] = (counts[file] ?? 0) + 1
  }
  return counts
}

function sortedEntries(counts) {
  return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
}

const output = await runTypecheck()
const current = countsByFile(output)
const currentTotal = Object.values(current).reduce((a, b) => a + b, 0)

// Zero parseable diagnostics can mean a clean tree — or that the type-checker
// never started (missing `.nuxt`, bad tsconfig, npx failure). Fail loudly on the
// latter instead of reporting a green run we didn't actually earn.
if (currentTotal === 0 && /Cannot find|is not recognized|ENOENT/i.test(output)) {
  console.error('typecheck did not run — output was:\n')
  console.error(output.slice(0, 4000))
  process.exit(2)
}

if (UPDATE) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ total: currentTotal, files: Object.fromEntries(sortedEntries(current)) }, null, 2)}\n`,
  )
  console.log(`baseline updated: ${currentTotal} errors across ${Object.keys(current).length} files`)
  process.exit(0)
}

let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
}
catch {
  console.error(`no baseline at ${BASELINE} — create one with: npm run typecheck:ci -- --update`)
  process.exit(2)
}

const allowed = baseline.files ?? {}
const regressions = []
const improvements = []

for (const [file, count] of sortedEntries(current)) {
  const budget = allowed[file] ?? 0
  if (count > budget) regressions.push({ file, count, budget })
}
for (const [file, budget] of sortedEntries(allowed)) {
  const count = current[file] ?? 0
  if (count < budget) improvements.push({ file, count, budget })
}

if (regressions.length > 0) {
  console.error('\n✘ New type errors (this is a regression gate, not a clean-tree gate):\n')
  for (const { file, count, budget } of regressions) {
    console.error(`  ${file}: ${count} error(s), baseline allows ${budget}`)
  }
  console.error('\nThe offending diagnostics:\n')
  const files = new Set(regressions.map(r => r.file))
  for (const line of output.split('\n')) {
    const match = ERROR_LINE.exec(line.trim())
    if (match && files.has(match[1])) console.error(`  ${line.trim()}`)
  }
  console.error(
    '\nFix them, or if you genuinely intend to accept them run:'
    + '\n  npm run typecheck:ci -- --update\n',
  )
  process.exit(1)
}

console.log(`✓ no new type errors (${currentTotal} known, baseline ${baseline.total})`)

if (improvements.length > 0) {
  console.log('\nFiles now better than the baseline — re-record it to lock this in:')
  for (const { file, count, budget } of improvements) {
    console.log(`  ${file}: ${count} (baseline ${budget})`)
  }
  console.log('\n  npm run typecheck:ci -- --update\n')
}
