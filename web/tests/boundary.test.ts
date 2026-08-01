import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { webRoot } from './helpers'

/**
 * The failure ladder, forced one rung at a time.
 *
 * Both stages are provoked by replacing the two components with ones that
 * throw, so production carries no test-only mode. Stage one is a descendant
 * failure that `mount()` has already returned from; stage two is the failure
 * view itself breaking, which no boundary above it can answer.
 */

const shouldFailApp = { value: false }
const shouldFailReportFailure = { value: false }

vi.mock('../src/components/App.svelte', async (importOriginal) => {
  const original = (await importOriginal()) as { default: unknown }
  return {
    default: (...args: unknown[]) => {
      if (shouldFailApp.value) throw new Error('a descendant of App exploded')
      return (original.default as (...a: unknown[]) => unknown)(...args)
    }
  }
})

vi.mock('../src/components/ReportFailure.svelte', async (importOriginal) => {
  const original = (await importOriginal()) as { default: unknown }
  return {
    default: (...args: unknown[]) => {
      if (shouldFailReportFailure.value) throw new Error('the failure view exploded too')
      return (original.default as (...a: unknown[]) => unknown)(...args)
    }
  }
})

const { renderReport } = await import('../src/main')

const ordinary = readFileSync(join(webRoot, 'fixtures', 'ordinary.json'), 'utf8')

function shell(): HTMLElement {
  document.body.innerHTML = ''
  const mount = document.createElement('div')
  mount.id = 'gitlog-html-app'
  document.body.append(mount)
  const script = document.createElement('script')
  script.id = 'gitlog-html-data'
  script.setAttribute('type', 'application/json')
  script.textContent = ordinary
  document.body.append(script)
  return mount
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()))

describe('startup failure ladder', () => {
  it('renders the report when nothing fails', () => {
    shouldFailApp.value = false
    shouldFailReportFailure.value = false
    const mount = shell()
    renderReport(mount)
    expect(mount.querySelector('ol.history__list')).not.toBeNull()
  })

  it('answers a descendant failure with the report-failure view', async () => {
    shouldFailApp.value = true
    shouldFailReportFailure.value = false
    const mount = shell()
    renderReport(mount)
    await flush()

    const alert = mount.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('This report could not be opened')
    // The Svelte view renders a detail block; the plain-DOM rung does not.
    expect(alert?.querySelector('.failure__detail')).not.toBeNull()
    expect(mount.querySelector('ol.history__list')).toBeNull()
  })

  it('falls through to plain DOM when the failure view fails as well', async () => {
    // Both rungs break. The outer boundary catches the second failure and the
    // imperative fallback runs, because it needs nothing from Svelte.
    shouldFailApp.value = true
    shouldFailReportFailure.value = true
    const mount = shell()
    renderReport(mount)
    await flush()
    await flush()

    const alert = mount.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.querySelector('.failure__title')?.textContent).toBe(
      'This report could not be opened'
    )
    expect(alert?.querySelector('.failure__text')?.textContent).toContain('exploded')
    // No detail block: this is the imperative rung, not the Svelte view.
    expect(alert?.querySelector('.failure__detail')).toBeNull()
    expect(mount.querySelector('ol.history__list')).toBeNull()
  })
})
