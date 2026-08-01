import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectAssets, normalizeAsset } from '../scripts/asset-rules.mjs'
import { repoRoot } from './helpers'

const assetsDir = resolve(repoRoot, 'internal', 'report', 'assets')
const names = ['app.js', 'app.css'] as const

describe('committed report assets', () => {
  it('are exactly one script and one stylesheet', () => {
    expect(readdirSync(assetsDir).sort()).toEqual(['app.css', 'app.js'])
  })

  it('carry nothing that would need a second file or a network request', () => {
    const script = readFileSync(join(assetsDir, 'app.js'), 'utf8')
    const style = readFileSync(join(assetsDir, 'app.css'), 'utf8')
    expect(inspectAssets(script, style)).toEqual([])
  })

  it('are a classic script rather than a module', () => {
    const script = readFileSync(join(assetsDir, 'app.js'), 'utf8')
    expect(script.trimStart().startsWith('import')).toBe(false)
    expect(script).not.toMatch(/export\s+default/)
  })

  it.each(names)('%s ends with exactly one newline and no trailing whitespace', (name) => {
    const text = readFileSync(join(assetsDir, name), 'utf8')
    expect(text.endsWith('\n')).toBe(true)
    expect(text.endsWith('\n\n')).toBe(false)
    expect(text.slice(0, -1)).not.toMatch(/\s$/)
  })

  it.each(names)('%s is already in the canonical committed form', (name) => {
    const text = readFileSync(join(assetsDir, name), 'utf8')
    expect(normalizeAsset(text)).toBe(text)
  })
})

describe('offline asset rules', () => {
  const css = 'a{color:red}'

  it.each([
    ['fetch', 'fetch("/x")'],
    ['sendBeacon', 'navigator.sendBeacon("https://example.test", data)'],
    ['XMLHttpRequest', 'new XMLHttpRequest()'],
    ['WebSocket', 'new WebSocket("wss://example.test")'],
    ['EventSource', 'new EventSource("/stream")'],
    ['a dedicated worker', 'new Worker("/worker.js")'],
    ['a shared worker', 'new SharedWorker("/worker.js")'],
    ['importScripts', 'importScripts("/worker.js")'],
    ['a service worker', 'navigator.serviceWorker.register("/sw.js")'],
    ['a source map', '//# sourceMappingURL=app.js.map'],
    ['a dynamic import', 'import("./chunk.js")'],
    ['an external script URL', 'el.src = "https://example.test/x.js"']
  ])('rejects %s', (_label, snippet) => {
    // Each of these would either fetch something or load a second file, and
    // both break the single-file promise.
    expect(inspectAssets(snippet, css).length).toBeGreaterThan(0)
  })

  it('accepts a bundle that does none of those things', () => {
    expect(inspectAssets('var a=1;document.getElementById("x");\n', css)).toEqual([])
  })
})

describe('asset normalisation', () => {
  it('adds a single terminating newline and collapses trailing whitespace', () => {
    expect(normalizeAsset('a;')).toBe('a;\n')
    expect(normalizeAsset('a;  \t\n\n  ')).toBe('a;\n')
    expect(normalizeAsset('a;\n')).toBe('a;\n')
  })

  it('is idempotent', () => {
    const once = normalizeAsset('a;   ')
    expect(normalizeAsset(once)).toBe(once)
  })

  it('leaves interior whitespace alone, including inside template literals', () => {
    // The minified bundle really does end a line with a space and a tab inside
    // Svelte's whitespace-character literal; stripping it would break the code.
    const source = 'var w=[...` \t\n\\r`];x;'
    expect(normalizeAsset(source)).toBe(`${source}\n`)
  })
})
