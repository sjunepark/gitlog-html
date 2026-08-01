import { readFileSync } from 'node:fs'

/**
 * The offline single-file invariant, expressed as checks.
 *
 * A report is copied, renamed, and opened from a file URL with networking
 * disabled. Anything in these two assets that implies a second file or a
 * network round trip breaks that promise, so the build refuses to ship it.
 */

const SCRIPT_RULES = [
  { name: 'source map reference', pattern: /\/\/[#@]\s*sourceMappingURL=/ },
  { name: 'ES module import statement', pattern: /(^|[;\n])\s*import[\s{*'"]/ },
  { name: 'ES module export statement', pattern: /(^|[;\n])\s*export[\s{*]/ },
  { name: 'dynamic import', pattern: /\bimport\s*\(/ },
  { name: 'import.meta usage', pattern: /import\.meta/ },
  { name: 'fetch call', pattern: /\bfetch\s*\(/ },
  { name: 'beacon request', pattern: /\.sendBeacon\s*\(/ },
  { name: 'XMLHttpRequest usage', pattern: /XMLHttpRequest/ },
  { name: 'WebSocket usage', pattern: /WebSocket/ },
  { name: 'EventSource usage', pattern: /EventSource/ },
  // A worker is a second file and a second execution context; either would
  // break the single-file promise even without a network call.
  { name: 'worker creation', pattern: /\bnew\s+(?:Shared)?Worker\s*\(/ },
  { name: 'worker script import', pattern: /\bimportScripts\s*\(/ },
  { name: 'service worker registration', pattern: /serviceWorker/ },
  { name: 'external resource URL', pattern: /(src|href)\s*[:=]\s*["'`]?(https?:)?\/\// },
  { name: 'document.write', pattern: /document\.write/ }
]

const STYLE_RULES = [
  { name: 'source map reference', pattern: /\/\*[#@]\s*sourceMappingURL=/ },
  { name: 'CSS @import', pattern: /@import/ },
  { name: 'external or data URL', pattern: /url\(/ },
  { name: 'remote font', pattern: /@font-face/ }
]

function check(label, text, rules) {
  const problems = []
  for (const rule of rules) {
    if (rule.pattern.test(text)) problems.push(`${label}: contains ${rule.name}`)
  }
  return problems
}

/**
 * Canonical on-disk form for a committed asset: no whitespace at the end of
 * the file, and exactly one terminating newline.
 *
 * Only the end of the file is touched. The minified bundle contains template
 * literals that span lines and legitimately end a line with a space or a tab —
 * Svelte's whitespace-character set is one of them — so stripping per line
 * would silently corrupt the program.
 */
export function normalizeAsset(text) {
  return `${text.replace(/\s+$/, '')}\n`
}

export function inspectAssets(scriptText, styleText) {
  return [...check('app.js', scriptText, SCRIPT_RULES), ...check('app.css', styleText, STYLE_RULES)]
}

export function inspectAssetFiles(scriptPath, stylePath) {
  return inspectAssets(readFileSync(scriptPath, 'utf8'), readFileSync(stylePath, 'utf8'))
}
