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
    await expect(page.getByRole('alert')).toContainText('This report could not be opened')
    await expect(page.locator('#gitlog-html-app')).not.toBeEmpty()
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
    await page.waitForTimeout(150)
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
    await page.waitForTimeout(150)
    await report.expectNoPageOverflow()
  })
})
