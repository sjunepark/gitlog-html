import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readEmbeddedReport, renderReport, start } from '../src/main'
import { ReportStartupError } from '../src/lib/schema'
import { webRoot } from './helpers'

const ordinary = readFileSync(join(webRoot, 'fixtures', 'ordinary.json'), 'utf8')

/** Builds the exact startup shape Go assembly emits. */
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
    shell(ordinary)
    expect(readEmbeddedReport().repository.name).toBe('acme-quotes')
  })

  it('fails clearly when the data element is missing', () => {
    shell(null)
    expect(reason(() => readEmbeddedReport())).toBe('missing-data')
  })

  it('refuses a data element that is not an application/json script', () => {
    shell(ordinary, 'text/plain')
    expect(reason(() => readEmbeddedReport())).toBe('missing-data')
  })

  it('refuses an empty data element', () => {
    shell('   ')
    expect(reason(() => readEmbeddedReport())).toBe('missing-data')
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
})
