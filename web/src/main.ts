/**
 * Browser startup for the standalone report.
 *
 * Go assembly emits one mount element and one inert JSON script element. This
 * entry point reads that data through `textContent`, validates the schema
 * version, and mounts the application. Every failure path ends in a readable
 * state inside the mount element rather than a blank page.
 */

import { mount } from 'svelte'
import App from './components/App.svelte'
import ReportFailure from './components/ReportFailure.svelte'
import { ReportStartupError, parseReportJson, type Report, type StartupFailureReason } from './lib/schema'
import './styles/app.css'

const MOUNT_ID = 'gitlog-html-app'
const DATA_ID = 'gitlog-html-data'

export function readEmbeddedReport(doc: Document = document): Report {
  const node = doc.getElementById(DATA_ID)
  if (node === null) {
    throw new ReportStartupError('missing-data', `no element with id "${DATA_ID}" was found`)
  }
  const type = node.getAttribute('type')
  if (node.tagName.toLowerCase() !== 'script' || type !== 'application/json') {
    throw new ReportStartupError(
      'missing-data',
      `element "${DATA_ID}" must be a script of type application/json`
    )
  }
  const text = node.textContent ?? ''
  if (text.trim() === '') {
    throw new ReportStartupError('missing-data', `element "${DATA_ID}" is empty`)
  }
  return parseReportJson(text)
}

function describe(error: unknown): { reason: StartupFailureReason; detail: string } {
  if (error instanceof ReportStartupError) return { reason: error.reason, detail: error.detail }
  return {
    reason: 'invalid-report',
    detail: error instanceof Error ? error.message : String(error)
  }
}

/**
 * Last resort. If Svelte itself cannot render the failure state, the reader
 * still gets a sentence instead of an empty document.
 */
function renderPlainFailure(target: HTMLElement, detail: string): void {
  target.textContent = ''
  const wrapper = target.ownerDocument.createElement('div')
  wrapper.className = 'failure'
  wrapper.setAttribute('role', 'alert')
  const title = target.ownerDocument.createElement('h1')
  title.className = 'failure__title'
  title.textContent = 'This report could not be opened'
  const text = target.ownerDocument.createElement('p')
  text.className = 'failure__text'
  text.textContent = detail
  wrapper.append(title, text)
  target.append(wrapper)
}

export function renderReport(target: HTMLElement, doc: Document = document): void {
  let report: Report
  try {
    report = readEmbeddedReport(doc)
  } catch (error) {
    const failure = describe(error)
    try {
      target.textContent = ''
      mount(ReportFailure, { target, props: failure })
    } catch {
      renderPlainFailure(target, failure.detail)
    }
    return
  }

  try {
    target.textContent = ''
    mount(App, { target, props: { report } })
  } catch (error) {
    const failure = describe(error)
    try {
      target.textContent = ''
      mount(ReportFailure, { target, props: failure })
    } catch {
      renderPlainFailure(target, failure.detail)
    }
  }
}

export function start(doc: Document = document): void {
  const target = doc.getElementById(MOUNT_ID)
  if (target === null) return
  renderReport(target, doc)
}

function boot(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => start(), { once: true })
    return
  }
  start()
}

boot()
