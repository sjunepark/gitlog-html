import { test as base, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const webRoot = resolve(here, '..')
const harnessDir = join(webRoot, 'harness')

export type ReportName =
  | 'ordinary'
  | 'dense'
  | 'edge-content'
  | 'empty-unborn'
  | 'detached-shallow'
  | 'unsupported-schema'
  | 'missing-data'

export function reportUrl(name: ReportName): string {
  const path = join(harnessDir, `${name}.html`)
  if (!existsSync(path)) {
    throw new Error(`missing harness file ${path}; run "npm run harness"`)
  }
  return pathToFileURL(path).href
}

/** Full object IDs in display order, read from the same fixture the page uses. */
export function fixtureOids(name: ReportName): string[] {
  const raw = readFileSync(join(webRoot, 'fixtures', `${name}.json`), 'utf8')
  const parsed = JSON.parse(raw) as { commits: { oid: string }[] }
  return parsed.commits.map((commit) => commit.oid)
}

/**
 * Every test runs against a real file URL and fails on any console error,
 * uncaught exception, or request that leaves the document. A standalone report
 * that phones home, or that logs an error while rendering, is a defect
 * regardless of what it looks like.
 */
export const test = base.extend<{ report: ReportPage }>({
  report: async ({ page }, use) => {
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console error: ${message.text()}`)
    })
    page.on('pageerror', (error) => problems.push(`uncaught error: ${error.message}`))
    page.on('request', (request) => {
      if (!request.url().startsWith('file:')) problems.push(`network request: ${request.url()}`)
    })
    await use(new ReportPage(page, problems))
    expect(problems, 'the report must run silently and offline').toEqual([])
  }
})

export class ReportPage {
  constructor(
    readonly page: Page,
    private readonly problems: string[]
  ) {}

  async open(name: ReportName): Promise<void> {
    await this.load(reportUrl(name))
  }

  async openAt(name: ReportName, fragment: string): Promise<void> {
    await this.load(`${reportUrl(name)}#${fragment}`)
  }

  /**
   * Opens any standalone report by path — used for the documents the real Go
   * CLI writes, which live outside the harness directory. Console, page-error
   * and network monitoring apply exactly as they do to the harness documents.
   */
  async openFile(path: string): Promise<void> {
    await this.load(pathToFileURL(path).href)
  }

  /** One definition of "the report has started". */
  private async load(url: string): Promise<void> {
    await this.page.goto(url)
    await this.page.waitForFunction(
      () => document.querySelector('#gitlog-html-app')?.children.length
    )
  }

  /**
   * Waits for every running animation to finish.
   *
   * Measuring or scanning mid-transition reports the animation rather than the
   * design: a sheet caught sliding up returns a position it is about to leave,
   * and a contrast scan reads a colour that never settles there.
   */
  async settle(): Promise<void> {
    await this.page.evaluate(async () => {
      await Promise.all(
        document.getAnimations().map((animation) => animation.finished.catch(() => {}))
      )
    })
  }

  /** Waits for a painted frame, for changes that reflow rather than animate. */
  async nextFrame(): Promise<void> {
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    )
  }

  rows() {
    return this.page.locator('.commit-row')
  }

  /** Horizontal page overflow is a defect at every viewport we support. */
  async expectNoPageOverflow(): Promise<void> {
    const measured = await this.page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth
    }))
    expect(
      measured.scroll,
      `page scrolls horizontally: ${measured.scroll} > ${measured.client}`
    ).toBeLessThanOrEqual(measured.client + 1)
  }

  /** Details live in a sticky pane on wide screens and a modal on narrow ones. */
  details() {
    return this.page.locator('.details')
  }

  ignore(pattern: RegExp): void {
    for (let index = this.problems.length - 1; index >= 0; index -= 1) {
      if (pattern.test(this.problems[index]!)) this.problems.splice(index, 1)
    }
  }
}

export { expect }
