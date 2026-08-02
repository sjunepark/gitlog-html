import type { Locator } from '@playwright/test'
import { expect, reportUrl, test } from './support'

/**
 * WebKit reports "ResizeObserver loop completed with undelivered notifications"
 * as an uncaught error when the root font size or CSS zoom changes abruptly,
 * and the fixture rightly fails on any uncaught error. The layout itself is
 * correct there — measured on the dense report, all 13 nodes still render and
 * every one stays aligned to its row, with no page overflow — so this skips the
 * synthetic-mutation cases rather than weakening what they assert. Chromium
 * keeps the coverage.
 */
const WEBKIT_RESIZE_OBSERVER =
  'WebKit raises a ResizeObserver notification on abrupt zoom or text-size changes; layout is verified correct'

test.describe('report states', () => {
  test('empty repository with an unborn branch', async ({ report }) => {
    await report.open('empty-unborn')
    const { page } = report
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('fresh-start')
    await expect(page.locator('.report-header')).toContainText('Branch main has no commits yet')
    await expect(page.locator('ol.history__list')).toHaveCount(0)
    await expect(page.locator('.empty')).toContainText('has no commits yet')
    await report.expectNoPageOverflow()
  })

  test('detached HEAD and shallow boundaries', async ({ report }) => {
    await report.open('detached-shallow')
    const { page } = report
    await expect(page.locator('.report-header')).toContainText('Detached HEAD — not on a branch')
    await expect(page.locator('.report-header')).toContainText('shallow copy of the repository')
    // A shallow boundary is drawn as a continuation glyph, not a root cap.
    await expect(page.locator('.boundary-glyph')).toHaveCount(2)
    await expect(page.locator('.root-cap')).toHaveCount(0)
    await report.expectNoPageOverflow()
  })

  test('a true root is drawn differently from a truncated edge', async ({ report }) => {
    await report.open('edge-content')
    await expect(report.page.locator('.root-cap')).toHaveCount(1)
    await expect(report.page.locator('.boundary-glyph')).toHaveCount(0)
  })

  test('a truncated slice marks its boundary and warns in the header', async ({ report }) => {
    await report.open('ordinary')
    await expect(report.page.locator('.edge--boundary')).toHaveCount(1)
    await expect(report.page.locator('.notice')).toHaveCount(2)
  })

  test('dense lanes stay inside the page and can pan when they do not fit', async ({ report }) => {
    await report.open('dense')
    const { page } = report
    await expect(page.locator('ol.history__list > li')).toHaveCount(13)
    await report.expectNoPageOverflow()

    const gutter = page.locator('.history__graph')
    const measured = await gutter.evaluate((node) => ({
      scroll: node.scrollWidth,
      client: node.clientWidth,
      pannable: node.classList.contains('history__graph--pannable')
    }))

    if (measured.pannable) {
      expect(measured.scroll).toBeGreaterThan(measured.client)
      await gutter.evaluate((node) => {
        node.scrollLeft = node.scrollWidth
      })
      await report.expectNoPageOverflow()
    } else {
      expect(measured.scroll).toBeLessThanOrEqual(measured.client + 1)
    }

    // Commit text keeps a usable width no matter how busy the graph is.
    const summary = await page.locator('.commit-row__summary').first().boundingBox()
    expect(summary!.width).toBeGreaterThanOrEqual(180)
  })

  test('an unsupported schema explains itself instead of rendering', async ({ report }) => {
    const { page } = report
    await page.goto(reportUrl('unsupported-schema'))
    // The failure path runs under the same policy a real report enforces.
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      /default-src 'none'/
    )
    await expect(page.getByRole('alert')).toContainText('This report could not be opened')
    await expect(page.getByRole('alert')).toContainText(
      'report format this viewer does not understand'
    )
    await expect(page.locator('h1')).toHaveCount(1)
    await report.expectNoPageOverflow()
  })

  test('missing report data fails readably rather than blankly', async ({ report }) => {
    const { page } = report
    await page.goto(reportUrl('missing-data'))
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      /default-src 'none'/
    )
    await expect(page.getByRole('alert')).toContainText('This report could not be opened')
    await expect(page.locator('#gitlog-html-app')).not.toBeEmpty()
  })

  test('carries the selection across the split-layout breakpoint', async ({ report }) => {
    const { page } = report
    await page.setViewportSize({ width: 390, height: 844 })
    await report.open('ordinary')

    const row = report.rows().nth(2)
    const oid = await row.getAttribute('data-oid')
    await row.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(page.url()).toContain(`#${oid}`)

    // Widening tears the native dialog down. That is the layout changing, not
    // the reader dismissing the commit.
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.details-pane .details')).toBeVisible()
    await expect(page.locator('.details-pane__subject')).toHaveText(
      'Let customers save a quote as a draft'
    )
    await expect(row).toHaveAttribute('aria-current', 'true')
    expect(page.url()).toContain(`#${oid}`)
    await report.expectNoPageOverflow()

    // Narrowing again returns the same commit to the sheet.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(page.url()).toContain(`#${oid}`)
  })

  test('dismissing the sheet by its backdrop still clears the selection', async ({ report }) => {
    const { page } = report
    await page.setViewportSize({ width: 390, height: 844 })
    await report.open('ordinary')

    const row = report.rows().first()
    await row.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    // The sheet slides up; measuring mid-animation would aim the click at a
    // point the sheet is about to occupy.
    await report.settle()

    // The backdrop is the area above the sheet; a click there targets the
    // dialog element itself rather than any of its content.
    const sheet = await page.locator('dialog.sheet').boundingBox()
    expect(sheet).not.toBeNull()
    await page.mouse.click(sheet!.x + sheet!.width / 2, Math.max(6, sheet!.y - 20))
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(new URL(page.url()).hash).toBe('')
    await expect(row).toBeFocused()
  })

  test('the document title names its controls instead of obeying them', async ({ report }) => {
    // A title is a flat string in the tab strip and the window chrome, where no
    // markup can isolate anything. internal/report/render.go names the controls
    // before escaping and the harness matches, so both producers describe
    // hostile input the same way.
    await report.open('edge-content')
    const title = await report.page.title()

    expect(title).toContain('[RLO]')
    expect(title).toContain('[PDF]')
    expect(title, 'a live override survived into the title').not.toContain(
      String.fromCharCode(0x202e)
    )
    expect(title, 'a live pop survived into the title').not.toContain(String.fromCharCode(0x202c))
    // The trusted suffix is still the last thing in the title.
    expect(title.endsWith('commit history')).toBe(true)
  })

  // Written as code points so this source line cannot itself be reordered.
  /** Every directional control, in code-point order. */
  const ALL_CONTROLS = [
    0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069
  ]
    .map((code) => String.fromCodePoint(code))
    .join('')
  /** The same twelve, in the same order, as both producers must name them. */
  const ALL_NAMED = '[ALM][LRM][RLM][LRE][RLE][PDF][LRO][RLO][LRI][RLI][FSI][PDI]'
  const ALL_NAMED_PATTERN = new RegExp(ALL_NAMED.replace(/[[\]]/g, '\\$&'))

  /** Fails on any control a flat string is still carrying rather than naming. */
  function expectNoActiveControls(value: string, where: string): void {
    for (const control of ALL_CONTROLS) {
      expect(
        value.includes(control),
        `${where} still carries U+${control.codePointAt(0)!.toString(16).toUpperCase()}`
      ).toBe(false)
    }
  }

  /**
   * The same check against the name the browser computes, not the markup.
   *
   * `toHaveAccessibleName` resolves the accessibility tree, so this fails if a
   * control reaches the name by any route — the attribute, the element's own
   * text, or a future labelling change.
   */
  async function expectNameNamesControls(locator: Locator, where: string): Promise<void> {
    for (const control of ALL_CONTROLS) {
      const point = `U+${control.codePointAt(0)!.toString(16).toUpperCase()}`
      await expect(locator, `${where} still carries ${point}`).not.toHaveAccessibleName(
        new RegExp(control)
      )
    }
  }

  test('assistive-only strings name their controls', async ({ report }) => {
    // Read from the accessibility tree, not from the markup: aria-label
    // replaces the row's text for assistive technology, so what matters is the
    // name the browser actually computes.
    await report.open('edge-content')
    const { page } = report
    const row = report.rows().nth(1)

    await expect(row).toHaveAccessibleName(/\[RLO\]/)
    await expect(row).toHaveAccessibleName(/\[PDF\]/)
    await expectNameNamesControls(row, 'the computed row name')

    // Supplemental: the attribute the name is computed from agrees.
    const attribute = (await row.getAttribute('aria-label')) ?? ''
    expectNoActiveControls(attribute, 'the aria-label attribute')

    // The visible row beside it still holds the original code points, inside
    // the isolated markers the accessibility tree exposes one by one.
    const visible = await page
      .locator('.history__item:nth-child(2) .commit-row__summary')
      .textContent()
    expect(visible).toContain(String.fromCharCode(0x202e))

    await row.click()
    await expect(report.details()).toBeVisible()

    // The live status belongs to the split layout; the phone announces the
    // selection by moving focus into the dialog instead. Its snapshot is the
    // announcement itself, because a status is read by its content.
    const status = page.locator('[role="status"]')
    if ((await status.count()) > 0) {
      const announced = await status.ariaSnapshot()
      expect(announced).toContain('[RLO]')
      expectNoActiveControls(announced, 'the computed live status')
    }
  })

  test('every supported control is named, in order, by both producers', async ({ report }) => {
    // Two independently maintained maps have to agree: the Go assembler's, which
    // the harness mirrors for the document title, and the report's own, which
    // names the assistive-only strings. Exercising all twelve through both is
    // what makes a control quietly dropped from either map fail here, and the
    // order is asserted as one sequence so a transposed pair fails too.
    await report.open('bidi-controls')
    const { page } = report

    const title = await page.title()
    expect(title).toContain(`controls-${ALL_NAMED}-probe`)
    expectNoActiveControls(title, 'the document title')

    const row = report.rows().first()
    await expect(row).toHaveAccessibleName(ALL_NAMED_PATTERN)
    await expectNameNamesControls(row, 'the computed row name')

    // The visible row keeps every original code point and marks each one.
    const summary = page.locator('.history__item:nth-child(1) .commit-row__summary')
    expect(await summary.textContent()).toContain(ALL_CONTROLS)
    await expect(summary.locator('.bidi-mark')).toHaveCount(ALL_CONTROLS.length)

    await row.click()
    await expect(report.details()).toBeVisible()
    const status = page.locator('[role="status"]')
    if ((await status.count()) > 0) {
      const announced = await status.ariaSnapshot()
      expect(announced).toContain(ALL_NAMED)
      expectNoActiveControls(announced, 'the computed live status')
    }

    await report.expectNoPageOverflow()
  })

  test('no untrusted field can reorder the text around it', async ({ report }) => {
    // Every field family carries "A<RLO>BC<PDF> Z". If any of them left the
    // override active, B would paint to the right of C and the field could be
    // made to read as something Git never recorded — in exactly the places a
    // reader uses to judge whether a report is trustworthy.
    await report.open('edge-content')
    const { page } = report
    await report.rows().nth(1).click()
    await expect(report.details()).toBeVisible()

    const fields = [
      ['repository name', '.report-header__name'],
      ['branch name', '.report-header__head'],
      // The probe lives on the second commit, which is the one carrying the
      // seeded identities and refs.
      ['row subject', '.history__item:nth-child(2) .commit-row__summary'],
      ['ref label', '.history__item:nth-child(2) .commit-row__refs .ref__name'],
      ['details title', '.details-pane__subject, .sheet__title'],
      ['identity', '.meta__person']
    ] as const

    for (const [label, selector] of fields) {
      const measured = await page.locator(selector).first().evaluate((root) => {
        const marker = root.closest('*')?.querySelector('.bidi-mark') ?? root.querySelector('.bidi-mark')
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
          markers: root.querySelectorAll('.bidi-mark').length,
          isolation: marker === null ? '' : getComputedStyle(marker).unicodeBidi,
          badge: marker === null ? '' : getComputedStyle(marker, '::before').content
        }
      })

      expect(measured.order, `${label} has no probe text to measure`).not.toBeNull()
      expect(measured.order!.b, `${label} let the override reorder its text`).toBeLessThan(
        measured.order!.c
      )
      expect(measured.markers, `${label} left a control unmarked`).toBeGreaterThan(0)
      expect(measured.isolation, `${label} marker is not isolated`).toBe('isolate')
      expect(measured.badge, `${label} marker shows no badge`).toMatch(/RLO|PDF/)
    }

    await report.expectNoPageOverflow()
  })

  test('names bidirectional formatting instead of quietly reordering text', async ({ report }) => {
    await report.open('edge-content')
    await report.rows().first().click()
    await expect(report.details()).toBeVisible()
    await expect(report.page.locator('.notice--inline')).toContainText(
      'bidirectional formatting characters'
    )
    // The text itself is untouched: the control characters are still in it.
    const stored = await report.page.locator('.prose').evaluate((node) => node.textContent ?? '')
    expect(stored).toContain(String.fromCharCode(0x202e))
    await report.expectNoPageOverflow()
  })

  for (const [mode, selector] of [
    ['explanation', '.prose'],
    ['commit message', '.raw-message']
  ] as const) {
    test(`renders bidi controls inertly in the ${mode}`, async ({ report }) => {
      await report.open('edge-content')
      await report.rows().first().click()
      if (mode === 'commit message') {
        await report.page.getByRole('tab', { name: 'Commit message' }).click()
      }
      const field = report.page.locator(selector)
      await expect(field).toBeVisible()

      const marks = field.locator('.bidi-mark')
      await expect(marks.first()).toBeVisible()

      const measured = await field.evaluate((root) => {
        // The badge is a pseudo-element, so it can be seen but never lands in
        // textContent.
        const marker = root.querySelector('.bidi-mark')
        const badge = marker === null ? null : getComputedStyle(marker, '::before')

        // "A<RLO>BC<PDF> Z" is in both fields. With the override neutralised,
        // B must still paint to the left of C.
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
          text: root.textContent ?? '',
          markerCount: root.querySelectorAll('.bidi-mark').length,
          markerText: marker?.textContent ?? '',
          badgeContent: badge?.content ?? '',
          markerIsolation: marker === null ? '' : getComputedStyle(marker).unicodeBidi,
          role: marker?.getAttribute('role') ?? '',
          label: marker?.getAttribute('aria-label') ?? '',
          order
        }
      })

      // Asserted first because it is the requirement itself, not the mechanism:
      // logical order survives, so the override cannot reorder what follows it.
      expect(measured.order).not.toBeNull()
      expect(measured.order!.b).toBeLessThan(measured.order!.c)

      // A visible, understandable badge, drawn from CSS.
      expect(measured.badgeContent).toMatch(/RLO|PDF|LRO|LRM|RLM/)
      expect(measured.markerIsolation).toBe('isolate')
      expect(measured.role).toBe('img')
      expect(measured.label).toMatch(/^Bidirectional control: /)

      // The control itself is still the only thing inside the marker, and the
      // field still holds every original code point.
      expect(measured.markerText).toHaveLength(1)
      expect(measured.markerCount).toBeGreaterThan(1)
      expect(measured.text).toContain(String.fromCharCode(0x202e))
      expect(measured.text).toContain(String.fromCharCode(0x202c))

      await report.expectNoPageOverflow()
    })
  }

  test('keeps the rendered text byte-identical to the report data', async ({ report }) => {
    await report.open('edge-content')
    await report.rows().first().click()
    // What the reader can select and copy is what Go embedded, unchanged.
    const matches = await report.page.evaluate(() => {
      const data = document.getElementById('gitlog-html-data')?.textContent ?? '{}'
      const parsed = JSON.parse(data) as { commits: { explanation?: string }[] }
      const shown = document.querySelector('.prose')?.textContent ?? ''
      return shown === parsed.commits[0]?.explanation
    })
    expect(matches).toBe(true)
  })

  test('honours a dark colour scheme', async ({ report }) => {
    await report.page.emulateMedia({ colorScheme: 'dark' })
    await report.open('ordinary')
    const background = await report.page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    )
    expect(background).toBe('rgb(19, 19, 17)')
    await report.rows().first().click()
    await expect(report.details()).toBeVisible()
    await report.expectNoPageOverflow()
  })

  test('honours reduced motion', async ({ report }) => {
    await report.page.emulateMedia({ reducedMotion: 'reduce' })
    await report.open('ordinary')
    await report.rows().first().click()
    const duration = await report.page
      .locator('.commit-row--selected')
      .evaluate((node) => getComputedStyle(node).transitionDuration)
    expect(Number.parseFloat(duration)).toBeLessThan(0.01)
  })

  test('survives increased text size without clipping controls', async ({ report }, testInfo) => {
    test.skip(testInfo.project.name === 'webkit-mobile', WEBKIT_RESIZE_OBSERVER)
    const { page } = report
    await report.open('ordinary')
    // Set through the CSSOM so the strict content-security policy stays intact.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '24px'
    })
    await report.nextFrame()
    await report.expectNoPageOverflow()
    await report.rows().first().click()
    await expect(report.details()).toBeVisible()
    await report.expectNoPageOverflow()
  })

  test('survives browser zoom', async ({ report }, testInfo) => {
    test.skip(testInfo.project.name === 'webkit-mobile', WEBKIT_RESIZE_OBSERVER)
    const { page } = report
    await report.open('ordinary')
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
    })
    await report.nextFrame()
    await report.expectNoPageOverflow()
  })
})
