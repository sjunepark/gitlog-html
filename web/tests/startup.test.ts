import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { readEmbeddedReport, renderReport, start } from '../src/main'
import { ReportStartupError } from '../src/lib/schema'
import { webRoot } from './helpers'

const ordinary = readFileSync(join(webRoot, 'fixtures', 'ordinary.json'), 'utf8')

/**
 * The startup shape Go assembly emits, in a live document.
 *
 * Reserved for the mounting tests, which need a document with a browsing
 * context. Only inert `application/json` data ever reaches it.
 */
function shell(data: string | null, type = 'application/json'): HTMLElement {
  document.body.innerHTML = ''
  const mount = document.createElement('div')
  mount.id = 'gitlog-html-app'
  document.body.append(mount)
  if (data !== null) {
    const script = document.createElement('script')
    script.id = 'gitlog-html-data'
    script.setAttribute('type', type)
    script.textContent = data
    document.body.append(script)
  }
  return mount
}

/**
 * The same shape in a document with no browsing context.
 *
 * `readEmbeddedReport` only reads, and it already takes the document to read
 * from, so these cases need no live window. Detaching means the report data is
 * never executed as a script — which is what lets the tests name an executable
 * type, or omit the type entirely, and still assert only the guard's verdict.
 */
function dataDocument(data: string | null, type: string | null = 'application/json'): Document {
  const doc = document.implementation.createHTMLDocument('report')
  const mount = doc.createElement('div')
  mount.id = 'gitlog-html-app'
  doc.body.append(mount)
  if (data !== null) {
    const script = doc.createElement('script')
    script.id = 'gitlog-html-data'
    if (type !== null) script.setAttribute('type', type)
    script.textContent = data
    doc.body.append(script)
  }
  return doc
}

function reason(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return error instanceof ReportStartupError ? error.reason : `unexpected:${String(error)}`
  }
  return 'no-error'
}

describe('browser startup contract', () => {
  it('reads the inert JSON element through textContent', () => {
    expect(readEmbeddedReport(dataDocument(ordinary)).repository.name).toBe('acme-quotes')
  })

  it('reads the live document when no document is supplied', () => {
    shell(ordinary)
    expect(readEmbeddedReport().repository.name).toBe('acme-quotes')
  })

  it('fails clearly when the data element is missing', () => {
    expect(reason(() => readEmbeddedReport(dataDocument(null)))).toBe('missing-data')
  })

  it.each(['text/javascript', 'module', 'text/plain', ''])(
    'refuses a data element typed %s',
    (type) => {
      // A data block that a browser would run is the case that matters most,
      // and the detached document lets the test say so without running it.
      expect(reason(() => readEmbeddedReport(dataDocument(ordinary, type)))).toBe('missing-data')
    }
  )

  it('refuses a data element with no type attribute at all', () => {
    const doc = dataDocument(ordinary, null)
    expect(doc.getElementById('gitlog-html-data')?.getAttribute('type')).toBeNull()
    expect(reason(() => readEmbeddedReport(doc))).toBe('missing-data')
  })

  it('refuses a data element that is not a script', () => {
    const doc = dataDocument(null)
    const data = doc.createElement('div')
    data.id = 'gitlog-html-data'
    data.setAttribute('type', 'application/json')
    data.textContent = ordinary
    doc.body.append(data)
    expect(reason(() => readEmbeddedReport(doc))).toBe('missing-data')
  })

  it('refuses an empty data element', () => {
    expect(reason(() => readEmbeddedReport(dataDocument('   ')))).toBe('missing-data')
  })

  it('mounts the report into the supplied element', () => {
    const mount = shell(ordinary)
    renderReport(mount)
    expect(mount.querySelectorAll('h1')).toHaveLength(1)
    expect(mount.querySelector('ol.history__list')).not.toBeNull()
  })

  it('replaces the mount with a readable failure instead of staying blank', () => {
    const mount = shell('{ broken')
    renderReport(mount)
    const alert = mount.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('This report could not be opened')
    expect(mount.querySelector('ol.history__list')).toBeNull()
  })

  it('explains an unsupported schema version specifically', () => {
    const mount = shell(JSON.stringify({ schemaVersion: 42 }))
    renderReport(mount)
    expect(mount.textContent).toContain('report format this viewer does not understand')
    expect(mount.textContent).toContain('format 42')
  })

  it('does nothing when the mount element is absent', () => {
    document.body.innerHTML = ''
    expect(() => start()).not.toThrow()
  })

  it('falls back to plain DOM when even the failure component cannot mount', () => {
    // The last resort in the ladder: if Svelte itself cannot render, the reader
    // still gets a sentence rather than an empty document.
    const mount = shell('{ broken')
    // Svelte inserts its nodes with these; renderPlainFailure uses append(),
    // which jsdom implements without going through either.
    const refuse = () => {
      throw new Error('mount refused')
    }
    vi.spyOn(mount, 'appendChild').mockImplementation(refuse)
    vi.spyOn(mount, 'insertBefore').mockImplementation(refuse)

    renderReport(mount)

    expect(mount.querySelector('.failure__title')?.textContent).toBe(
      'This report could not be opened'
    )
    expect(mount.querySelector('[role="alert"]')).not.toBeNull()
    // The detail is the parser's own message, so the reader still learns why.
    expect(mount.querySelector('.failure__text')?.textContent ?? '').not.toBe('')
  })
})
