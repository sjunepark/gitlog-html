import { expect, reportUrl, test } from './support'

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

  test('survives increased text size without clipping controls', async ({ report }) => {
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

  test('survives browser zoom', async ({ report }) => {
    const { page } = report
    await report.open('ordinary')
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2'
    })
    await report.nextFrame()
    await report.expectNoPageOverflow()
  })
})
