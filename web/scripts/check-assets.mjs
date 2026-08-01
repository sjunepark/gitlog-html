#!/usr/bin/env node
/**
 * Proves the committed UI assets are both deterministic and current.
 *
 * Two independent builds must be byte-identical to each other, and identical
 * to what is committed under internal/report/assets. CI can therefore reject a
 * report bundle that no longer matches the Svelte source it claims to be.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectAssets, normalizeAsset } from './asset-rules.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')
const assetsDir = resolve(webRoot, '..', 'internal', 'report', 'assets')
const names = ['app.js', 'app.css']

function fail(message) {
  console.error(message)
  process.exit(1)
}

// The comparison runs on the same normalised text emit-assets.mjs writes, so
// this check proves the committed bytes, not an intermediate form.
function buildInto(outDir) {
  rmSync(outDir, { recursive: true, force: true })
  execFileSync('node', [join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', outDir], {
    cwd: webRoot,
    stdio: 'pipe'
  })
  return Object.fromEntries(
    names.map((name) => [name, normalizeAsset(readFileSync(join(outDir, name), 'utf8'))])
  )
}

const first = buildInto(join(webRoot, '.assets-check-a'))
const second = buildInto(join(webRoot, '.assets-check-b'))

for (const name of names) {
  if (first[name] !== second[name]) {
    fail(`${name} is not reproducible: two builds of the same source differ`)
  }
}

const problems = inspectAssets(first['app.js'], first['app.css'])
if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  fail('the build violates the standalone-report asset rules')
}

for (const name of names) {
  const committed = join(assetsDir, name)
  if (!existsSync(committed)) {
    fail(`internal/report/assets/${name} is missing; run "npm run build" in web/`)
  }
  if (readFileSync(committed, 'utf8') !== first[name]) {
    fail(`internal/report/assets/${name} is stale; run "npm run build" in web/`)
  }
}

rmSync(join(webRoot, '.assets-check-a'), { recursive: true, force: true })
rmSync(join(webRoot, '.assets-check-b'), { recursive: true, force: true })

console.log('generated assets are reproducible and current')
