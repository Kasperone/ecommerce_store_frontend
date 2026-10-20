#!/usr/bin/env node
/**
 * Typecheck baseline guard — "the baseline may only go down".
 *
 *   node scripts/typecheck-baseline-guard.mjs <base.json> <head.json>
 *
 * Pure JSON comparison (no typecheck run). Fails when the head baseline is
 * worse than the base branch's: a higher total, a higher per-file budget, or a
 * file that has a budget in head but none in base. CI skips this when the PR
 * carries the `typecheck-accept-regression` label. See
 * scripts/typecheck-ratchet.mjs and the ratchet plan.
 */

import { readFileSync } from 'node:fs'
import process from 'node:process'

const [basePath, headPath] = process.argv.slice(2)
if (!basePath || !headPath) {
  console.error('usage: typecheck-baseline-guard.mjs <base.json> <head.json>')
  process.exit(2)
}

function load(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  }
  catch (err) {
    console.error(`cannot read ${path}: ${err.message}`)
    process.exit(2)
  }
}

const base = load(basePath)
const head = load(headPath)
const baseFiles = base.files ?? {}
const headFiles = head.files ?? {}
const offences = []

if (head.total > base.total) {
  offences.push(`total rose from ${base.total} to ${head.total}`)
}
for (const [file, budget] of Object.entries(headFiles)) {
  if (!(file in baseFiles)) {
    offences.push(`${file}: new file with ${budget} error(s) (absent from base)`)
  }
  else if (budget > baseFiles[file]) {
    offences.push(`${file}: budget rose from ${baseFiles[file]} to ${budget}`)
  }
}

if (offences.length > 0) {
  console.error('✘ typecheck baseline got worse than the base branch:\n')
  for (const o of offences) console.error(`  ${o}`)
  console.error('\nFix the errors instead of re-recording the baseline, or add the `typecheck-accept-regression` label if this is intentional.')
  process.exit(1)
}

console.log(`✓ baseline did not grow (base ${base.total}, head ${head.total})`)
