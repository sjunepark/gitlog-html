#!/usr/bin/env node
/**
 * Installs the deterministic Vite output into the Go embed directory.
 *
 * The Go build must not require Node, so the compiled UI is committed. This
 * script is the only writer of those two files; they are never hand-edited.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectAssets, normalizeAsset } from './asset-rules.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')
const distDir = join(webRoot, 'dist')
const assetsDir = resolve(webRoot, '..', 'internal', 'report', 'assets')

const produced = readdirSync(distDir).sort()
const expected = ['app.css', 'app.js']
if (produced.join(',') !== expected.join(',')) {
  console.error(
    `build produced ${JSON.stringify(produced)} but the report can only embed ${JSON.stringify(expected)}`
  )
  process.exit(1)
}

// Normalise before inspecting so what is checked is exactly what is written.
const script = normalizeAsset(readFileSync(join(distDir, 'app.js'), 'utf8'))
const style = normalizeAsset(readFileSync(join(distDir, 'app.css'), 'utf8'))

const problems = inspectAssets(script, style)
if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}

mkdirSync(assetsDir, { recursive: true })
writeFileSync(join(assetsDir, 'app.js'), script)
writeFileSync(join(assetsDir, 'app.css'), style)

console.log(`wrote app.js (${script.length} bytes) and app.css (${style.length} bytes) to ${assetsDir}`)
