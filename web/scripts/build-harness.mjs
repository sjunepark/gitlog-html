#!/usr/bin/env node
/**
 * Builds standalone report files for browser testing.
 *
 * The Go assembly layer does not exist yet, so this harness reproduces its
 * documented contract exactly: one mount element, one inert JSON script read
 * through textContent, one inlined stylesheet, one inlined classic IIFE, a
 * per-document nonce, and a restrictive content-security policy. Testing
 * against this shape is what makes the browser results meaningful.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '..')
const assetsDir = resolve(webRoot, '..', 'internal', 'report', 'assets')
const fixturesDir = join(webRoot, 'fixtures')
const outDir = join(webRoot, 'harness')

const script = readFileSync(join(assetsDir, 'app.js'), 'utf8')
const style = readFileSync(join(assetsDir, 'app.css'), 'utf8')

/**
 * Mirrors Go's HTML-safe JSON escaping so the data block stays valid even when
 * commit text contains a closing script sequence or a line separator.
 */
function encodeReportData(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(String.fromCharCode(0x2028), '\\u2028')
    .replaceAll(String.fromCharCode(0x2029), '\\u2029')
}

function escapeText(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Deterministic per-document nonce keeps harness output byte-stable. */
function nonceFor(name) {
  return createHash('sha256').update(name).digest('base64').slice(0, 22)
}

function policyFor(nonce) {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}

function render(name, report) {
  const nonce = nonceFor(name)
  const policy = policyFor(nonce)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${escapeText(report.repository.name)} — commit history</title>
<style nonce="${nonce}">${style}</style>
</head>
<body>
<div id="gitlog-html-app"></div>
<noscript>This report is interactive and needs JavaScript to display the commit history.</noscript>
<script id="gitlog-html-data" type="application/json" nonce="${nonce}">${encodeReportData(report)}</script>
<script nonce="${nonce}">${script}</script>
</body>
</html>
`
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const fixtures = readdirSync(fixturesDir).filter((file) => file.endsWith('.json')).sort()
for (const file of fixtures) {
  const name = basename(file, '.json')
  const report = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  writeFileSync(join(outDir, `${name}.html`), render(name, report))
}

/**
 * The startup contract also has to fail well, and it has to fail well under the
 * same policy the Go assembly layer will enforce. These two documents carry the
 * identical CSP and nonce wiring, so a failure state that quietly needed
 * unsafe-inline would be caught here rather than in a shipped report.
 */
function renderFailure(name, title, dataElement) {
  const nonce = nonceFor(name)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${policyFor(nonce)}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${escapeText(title)}</title>
<style nonce="${nonce}">${style}</style>
</head>
<body>
<div id="gitlog-html-app"></div>
<noscript>This report is interactive and needs JavaScript to display the commit history.</noscript>
${dataElement === null ? '' : dataElement(nonce)}
<script nonce="${nonce}">${script}</script>
</body>
</html>
`
}

const futureSchema = {
  schemaVersion: 99,
  generator: { name: 'gitlog-html' },
  generatedAt: '2026-08-01T12:00:00Z',
  repository: { name: 'future', head: { kind: 'unborn', branch: 'main' } },
  selection: { scope: 'all', maximumCount: 10, includedCount: 0, truncated: false },
  commits: [],
  graph: { laneCount: 0, rows: [] },
  warnings: []
}

writeFileSync(
  join(outDir, 'unsupported-schema.html'),
  renderFailure(
    'unsupported-schema',
    'Unsupported report',
    (nonce) =>
      `<script id="gitlog-html-data" type="application/json" nonce="${nonce}">${encodeReportData(futureSchema)}</script>`
  )
)

writeFileSync(
  join(outDir, 'missing-data.html'),
  renderFailure('missing-data', 'Damaged report', null)
)

console.log(`wrote ${fixtures.length + 2} standalone report files to ${outDir}`)
