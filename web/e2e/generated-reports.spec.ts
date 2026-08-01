import { existsSync, readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { expect, test } from './support'
import {
  BIDI_ORDER_PROBE,
  HOSTILE_AUTHOR_EMAIL,
  HOSTILE_AUTHOR_NAME,
  HOSTILE_BODY,
  HOSTILE_BRANCH,
  HOSTILE_COMMITTER_EMAIL,
  HOSTILE_COMMITTER_NAME,
  HOSTILE_EXPLANATION,
  HOSTILE_SUBJECT,
  HOSTILE_TAG,
  REF_ONLY_SUBJECT,
  manifestPath,
  type GeneratedManifest,
  type GeneratedReport
} from './generate-reports'

/**
 * The real artifact, opened the way a reader opens it.
 *
 * Every other spec exercises a document this repository assembles in
 * JavaScript. These open HTML written by the actual Go CLI from actual Git
 * repositories, through `file://`, so the last untested seam — Go assembly —
 * is covered by the same browser assertions as everything else. The `report`
 * fixture still fails the test on any console error, uncaught exception, or
 * request that leaves the document, so a CSP violation or a stray fetch in a
 * generated report shows up here.
 */

if (!existsSync(manifestPath)) {
  // Go and Git are required dependencies of this project, so an absent
  // manifest is a broken run rather than an unavailable capability.
  throw new Error(
    `no generated-report manifest at ${manifestPath}. Playwright global setup ` +
      '(e2e/generate-reports.ts) builds the real CLI and generates the reports these ' +
      'tests open; it must run before this spec.'
  )
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as GeneratedManifest

function reportFor(name: string): GeneratedReport {
  const found = manifest.reports[name]
  if (found === undefined) throw new Error(`the setup produced no "${name}" report`)
  return found
}

interface EmbeddedReport {
  selection: { scope: string; maximumCount: number; includedCount: number; truncated: boolean }
  repository: { name: string; head: { kind: string; branch?: string } }
  commits: {
    subject: string
    rawMessage: string
    explanation?: string
    author: { name: string; email: string }
    committer: { name: string; email: string }
    refs: { displayName: string }[]
  }[]
}

/**
 * The report's own data, read from the inert JSON element.
 *
 * Assertions about selection are made here rather than against row text: a row
 * shows the agent's explanation when there is one, so the subject may never
 * appear on screen even though the commit is genuinely included.
 */
async function embedded(page: Page): Promise<EmbeddedReport> {
  return page.evaluate(
    () =>
      JSON.parse(document.getElementById('gitlog-html-data')?.textContent ?? '{}') as EmbeddedReport
  )
}

test.describe('reports written by the Go CLI', () => {
  test('the default run shows ten commits across all refs, and says it truncated', async ({
    report
  }) => {
    const generated = reportFor('all-default')
    await report.openFile(generated.html)
    const { page } = report

    expect(generated.commits).toBe(10)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ordinary')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('.report-header')).toContainText('On branch main')
    await expect(page.locator('.report-header')).toContainText(
      'Latest 10 commits across all branches and tags'
    )
    await expect(page.locator('ol.history__list > li')).toHaveCount(10)

    const data = await embedded(page)
    expect(data.selection).toMatchObject({
      scope: 'all',
      maximumCount: 10,
      includedCount: 10,
      truncated: true
    })
    // Thirteen commits exist, so the limit genuinely binds and the reader must
    // be told history continues.
    await expect(page.locator('.notice')).toContainText('History continues before')
    await report.expectNoPageOverflow()
  })

  test('the all-refs selection reaches a commit no branch has merged', async ({ report }) => {
    // The proof that "all refs" is a selection and not just a label: this
    // commit lives on an unmerged ref, so nothing on the current branch can
    // reach it.
    await report.openFile(reportFor('all-default').html)
    const data = await embedded(report.page)

    const subjects = data.commits.map((commit) => commit.subject)
    expect(subjects).toContain(REF_ONLY_SUBJECT)
  })

  test('explanations appear where the agent supplied them, subjects where it did not', async ({
    report
  }) => {
    await report.openFile(reportFor('all-default').html)
    const data = await embedded(report.page)
    const shown = await report.page.locator('.commit-row__summary').allTextContents()

    expect(shown).toHaveLength(data.commits.length)
    const withExplanation = data.commits.filter(
      (commit) => commit.explanation !== undefined
    ).length
    const shownAsSubject = data.commits.filter(
      (commit, index) => shown[index] === commit.subject
    ).length

    // Both kinds are present in this one report...
    expect(withExplanation).toBeGreaterThan(0)
    expect(withExplanation).toBeLessThan(data.commits.length)
    // ...and every commit without an explanation falls back to its subject,
    // with no invented placeholder standing in for a missing one.
    expect(shownAsSubject).toBe(data.commits.length - withExplanation)
  })

  test('the current branch is selected by ancestry, not by the commit limit', async ({
    report
  }) => {
    const generated = reportFor('current-limit')
    await report.openFile(generated.html)
    const { page } = report

    expect(generated.commits).toBe(12)
    const data = await embedded(page)
    expect(data.selection).toMatchObject({
      scope: 'current',
      maximumCount: 12,
      includedCount: 12,
      // The caller's limit is not reached, so the report claims completeness
      // for this branch rather than truncation.
      truncated: false
    })
    await expect(page.locator('.report-header')).toContainText(
      'All 12 commits on the current branch'
    )
    await expect(page.locator('ol.history__list > li')).toHaveCount(12)

    // The limit is large enough to hold every commit on main, so the ref-only
    // commit's absence is a statement about scope rather than about the limit.
    expect(data.commits.map((commit) => commit.subject)).not.toContain(REF_ONLY_SUBJECT)
    await report.expectNoPageOverflow()
  })

  test('a report carried away from its repository still opens and reads the same', async ({
    report
  }) => {
    // The copy lives outside every repository the setup created. If anything
    // in the document referred back to its source, this is where it would fail.
    const relocated = reportFor('relocated')
    expect(relocated.html).not.toContain('repositories')
    await report.openFile(relocated.html)

    await expect(report.page.getByRole('heading', { level: 1 })).toHaveText('ordinary')
    await expect(report.page.locator('ol.history__list > li')).toHaveCount(10)
    await expect(report.page.locator('.report-header')).toContainText(
      'Latest 10 commits across all branches and tags'
    )
    await report.expectNoPageOverflow()
  })

  test('an empty repository reports an unborn branch instead of failing', async ({ report }) => {
    const generated = reportFor('empty')
    await report.openFile(generated.html)

    expect(generated.commits).toBe(0)
    await expect(report.page.locator('.report-header')).toContainText(
      'Branch main has no commits yet'
    )
    await expect(report.page.locator('ol.history__list')).toHaveCount(0)
    await expect(report.page.locator('.empty')).toBeVisible()
    await expect(report.page.getByRole('alert')).toHaveCount(0)
    await report.expectNoPageOverflow()
  })

  test('a detached HEAD is named as such', async ({ report }) => {
    await report.openFile(reportFor('detached').html)
    await expect(report.page.locator('.report-header')).toContainText(
      'Detached HEAD — not on a branch'
    )
    await expect(report.page.locator('ol.history__list > li')).toHaveCount(2)
    await report.expectNoPageOverflow()
  })

  test('every hostile value the CLI recorded survives intact in the report data', async ({
    report
  }) => {
    // The classes plans/report-generation-cli.md requires, checked where they
    // land after the whole Git-to-Go-to-browser path.
    await report.openFile(reportFor('hostile').html)
    const commit = (await embedded(report.page)).commits[0]!

    expect(commit.subject).toBe(HOSTILE_SUBJECT)
    expect(commit.rawMessage).toBe(`${HOSTILE_SUBJECT}\n\n${HOSTILE_BODY}\n`)
    expect(commit.explanation).toBe(HOSTILE_EXPLANATION)

    // Identities and refs, exactly as Git stored them. Git strips trailing
    // punctuation from an identity name, so a change there would show up as an
    // inequality rather than being quietly absorbed.
    expect(commit.author).toMatchObject({
      name: HOSTILE_AUTHOR_NAME,
      email: HOSTILE_AUTHOR_EMAIL
    })
    expect(commit.committer).toMatchObject({
      name: HOSTILE_COMMITTER_NAME,
      email: HOSTILE_COMMITTER_EMAIL
    })
    expect(commit.refs.map((ref) => ref.displayName)).toEqual(
      expect.arrayContaining([HOSTILE_BRANCH, HOSTILE_TAG])
    )

    // Each hostile class the plan requires, named so a failure says which one
    // was lost and in which field. The two fields carry different wording, so
    // each has its own witness rather than a needle weak enough to match both.
    const classes: { label: string; raw: string; explanation?: string }[] = [
      { label: 'closing script', raw: '</script><script>', explanation: '</script><script>' },
      { label: 'closing style', raw: '</style><style>', explanation: '</style><style>' },
      { label: 'image and event handler', raw: '<img src=x onerror=alert(1)>' },
      { label: 'quotes', raw: '"quoted"', explanation: '"double"' },
      { label: 'ampersand', raw: ' & ', explanation: 'ampersand &' },
      { label: 'backslashes', raw: 'C:\\Users\\admin', explanation: 'C:\\tmp\\x' },
      {
        label: 'line separator',
        raw: String.fromCharCode(0x2028),
        explanation: String.fromCharCode(0x2028)
      },
      {
        label: 'paragraph separator',
        raw: String.fromCharCode(0x2029),
        explanation: String.fromCharCode(0x2029)
      },
      {
        label: 'right-to-left override',
        raw: String.fromCharCode(0x202e),
        explanation: String.fromCharCode(0x202e)
      },
      { label: 'multiple lines', raw: '\n', explanation: '\n' }
    ]
    for (const { label, raw, explanation } of classes) {
      expect(commit.rawMessage, `the raw message lost its ${label}`).toContain(raw)
      if (explanation !== undefined) {
        expect(commit.explanation, `the explanation lost its ${label}`).toContain(explanation)
      }
    }
  })

  test('hostile commit text and a hostile explanation stay inert and readable', async ({
    report
  }) => {
    await report.openFile(reportFor('hostile').html)
    const { page } = report

    // Nothing from the repository became markup: no injected script, style,
    // or image, whatever the payload looked like.
    await expect(page.locator('#gitlog-html-app script')).toHaveCount(0)
    await expect(page.locator('#gitlog-html-app style')).toHaveCount(0)
    await expect(page.locator('#gitlog-html-app img')).toHaveCount(0)

    // The agent's explanation leads the row, as text.
    await expect(page.locator('.commit-row__summary').first()).toContainText(
      "Agent note: </script><script>alert('explanation')</script>"
    )

    await report.rows().first().click()
    await expect(report.details()).toBeVisible()
    // The commit subject is shown verbatim in the details title.
    await expect(page.locator('.details-pane__subject, .sheet__title')).toContainText(
      HOSTILE_SUBJECT
    )

    // Both text views show exactly what Git recorded, byte for byte.
    expect(await page.locator('.prose').textContent()).toBe(HOSTILE_EXPLANATION)
    await page.getByRole('tab', { name: 'Commit message' }).click()
    expect(await page.locator('.raw-message').textContent()).toBe(
      `${HOSTILE_SUBJECT}\n\n${HOSTILE_BODY}\n`
    )

    await expect(page.locator('#gitlog-html-app script')).toHaveCount(0)
    await expect(page.locator('#gitlog-html-app style')).toHaveCount(0)
    await report.expectNoPageOverflow()
  })

  test('hostile ref labels and identities are shown as readable text', async ({ report }) => {
    await report.openFile(reportFor('hostile').html)
    const { page } = report

    // A ref whose name looks like markup is still a label a reader can read.
    const refs = await page.locator('.commit-row').first().locator('.ref__name').allTextContents()
    expect(refs).toEqual(expect.arrayContaining([HOSTILE_BRANCH, HOSTILE_TAG]))

    await report.rows().first().click()
    await expect(report.details()).toBeVisible()

    // Author and committer differ here, so the details name both.
    const people = await page.locator('.meta__person').allTextContents()
    expect(people).toContain(`${HOSTILE_COMMITTER_NAME} <${HOSTILE_COMMITTER_EMAIL}>`)
    expect(people).toContain(`${HOSTILE_AUTHOR_NAME} <${HOSTILE_AUTHOR_EMAIL}>`)

    // The ref labels repeat in the details, still as text.
    await expect(report.details().locator('.meta__refs')).toContainText(HOSTILE_TAG)
    await expect(page.locator('#gitlog-html-app script')).toHaveCount(0)
    await report.expectNoPageOverflow()
  })

  for (const [mode, selector] of [
    ['explanation', '.prose'],
    ['commit message', '.raw-message']
  ] as const) {
    test(`bidi controls in the generated ${mode} are marked and never reorder text`, async ({
      report
    }) => {
      await report.openFile(reportFor('hostile').html)
      const { page } = report
      await report.rows().first().click()
      if (mode === 'commit message') {
        await page.getByRole('tab', { name: 'Commit message' }).click()
      }
      await expect(page.locator(selector)).toBeVisible()

      const measured = await page.locator(selector).evaluate((root) => {
        const marker = root.querySelector('.bidi-mark')
        // "A<RLO>BC<PDF> Z": with the override neutralised, B paints left of C.
        let order: { b: number; c: number } | null = null
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          if (node.textContent !== 'BC') continue
          const range = document.createRange()
          range.setStart(node, 0)
          range.setEnd(node, 1)
          const b = range.getBoundingClientRect().left
          range.setStart(node, 1)
          range.setEnd(node, 2)
          order = { b, c: range.getBoundingClientRect().left }
          break
        }
        return {
          order,
          badge: marker === null ? '' : getComputedStyle(marker, '::before').content,
          label: marker?.getAttribute('aria-label') ?? '',
          role: marker?.getAttribute('role') ?? '',
          markerText: marker?.textContent ?? ''
        }
      })

      // The requirement itself, asserted before the mechanism that delivers it.
      expect(measured.order).not.toBeNull()
      expect(measured.order!.b).toBeLessThan(measured.order!.c)

      // Visibly marked and announced, with the control still the only thing
      // inside the marker.
      expect(measured.badge).toMatch(/RLO|PDF/)
      expect(measured.role).toBe('img')
      expect(measured.label).toMatch(/^Bidirectional control: /)
      expect(measured.markerText).toHaveLength(1)

      // The probe text is present unchanged, controls and all.
      expect(await page.locator(selector).textContent()).toContain(BIDI_ORDER_PROBE)
      await report.expectNoPageOverflow()
    })
  }

  test('a shallow clone marks its boundary and never implies a root', async ({ report }) => {
    test.skip(manifest.shallowSkip !== null, manifest.shallowSkip ?? '')
    await report.openFile(reportFor('shallow').html)
    const { page } = report

    await expect(page.locator('.notice')).toContainText('shallow')
    // A shallow boundary is drawn as a continuation, never as a root cap.
    await expect(page.locator('.boundary-glyph')).toHaveCount(1)
    await expect(page.locator('.root-cap')).toHaveCount(0)
    await report.expectNoPageOverflow()
  })

  test('every generated report is a single self-contained offline document', async ({ report }) => {
    // One structural pass over all of them: the file-URL invariants the Go
    // assembler is responsible for.
    for (const [name, generated] of Object.entries(manifest.reports)) {
      const source = readFileSync(generated.html, 'utf8')
      expect(source, `${name} must carry a restrictive policy`).toContain(`default-src 'none'`)
      expect(source, `${name} must not reference an external resource`).not.toMatch(
        /(src|href)\s*=\s*["'](https?:)?\/\//
      )
      expect(source, `${name} must not link a stylesheet`).not.toMatch(/<link[^>]+stylesheet/i)
      expect(source, `${name} must not ship a source map`).not.toContain('sourceMappingURL')

      await report.openFile(generated.html)
      const data = report.page.locator('#gitlog-html-data')
      await expect(data, `${name} needs one inert data element`).toHaveCount(1)
      await expect(data).toHaveAttribute('type', 'application/json')
      await expect(report.page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
      // Startup succeeded: the mount has content and no failure state.
      await expect(report.page.locator('#gitlog-html-app')).not.toBeEmpty()
      await expect(report.page.getByRole('alert')).toHaveCount(0)
    }
  })
})
