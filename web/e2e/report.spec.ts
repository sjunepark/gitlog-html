import { expect, fixtureOids, test } from './support'

test.describe('standalone report opened from a file URL', () => {
  test('renders the history with one heading and an ordered list', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('acme-quotes')
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByRole('region', { name: 'Commit history' })).toBeVisible()
    await expect(page.locator('ol.history__list > li')).toHaveCount(10)
    await expect(report.rows()).toHaveCount(10)
    await report.expectNoPageOverflow()
  })

  test('states the branch, the scope, and the truncation limit', async ({ report }) => {
    await report.open('ordinary')
    const header = report.page.locator('.report-header')
    await expect(header).toContainText('On branch main')
    await expect(header).toContainText('Latest 10 commits across all branches and tags')
    await expect(header).toContainText('History continues before the oldest commit shown here.')
  })

  test('selects a commit by pointer and writes the full object ID to the fragment', async ({
    report
  }) => {
    await report.open('ordinary')
    const first = report.rows().first()
    const oid = await first.getAttribute('data-oid')
    await first.click()
    await expect(report.details()).toBeVisible()
    expect(report.page.url()).toContain(`#${oid}`)
    await expect(first).toHaveAttribute('aria-current', 'true')
    await report.expectNoPageOverflow()
  })

  test('selects with the keyboard using Enter and Space', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    await page.keyboard.press('Tab')
    await expect(report.rows().first()).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(report.details()).toBeVisible()
    const firstOid = await report.rows().first().getAttribute('data-oid')
    expect(page.url()).toContain(`#${firstOid}`)

    // Space must activate the control too, not scroll the page.
    await page.keyboard.press('Escape')
    await report.rows().nth(1).focus()
    await page.keyboard.press('Space')
    const secondOid = await report.rows().nth(1).getAttribute('data-oid')
    await expect(report.rows().nth(1)).toHaveAttribute('aria-current', 'true')
    expect(page.url()).toContain(`#${secondOid}`)
  })

  test('keeps the keyboard focus ring visible on the commit control', async ({ report }) => {
    await report.open('ordinary')
    await report.page.keyboard.press('Tab')
    const outline = await report.rows().first().evaluate((node) => {
      const style = getComputedStyle(node)
      return { width: style.outlineWidth, style: style.outlineStyle }
    })
    expect(outline.style).not.toBe('none')
    expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2)
  })

  test('opens on the commit named by a valid initial fragment', async ({ report }) => {
    // A cold load, exactly as another reader would open a shared copy.
    const target = fixtureOids('ordinary')[3]!
    await report.openAt('ordinary', target)
    await expect(report.details()).toBeVisible()
    await expect(report.rows().nth(3)).toHaveAttribute('aria-current', 'true')
    expect(report.page.url()).toContain(`#${target}`)
  })

  test('ignores an unknown fragment without an error banner', async ({ report }) => {
    await report.openAt('ordinary', 'deadbeef')
    await expect(report.details()).toHaveCount(0)
    await expect(report.page.locator('[role="alert"]')).toHaveCount(0)
    await expect(report.rows()).toHaveCount(10)
  })

  test('follows browser back and forward through selections', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    const [firstOid, secondOid] = fixtureOids('ordinary')

    // Following a parent works the same on both layouts: on a phone the modal
    // covers the rows behind it, so a second row click is not a real gesture.
    await report.rows().first().click()
    await page
      .locator('.details')
      .getByRole('button', { name: /Fixed a rounding problem/ })
      .click()
    await expect(report.rows().nth(1)).toHaveAttribute('aria-current', 'true')
    expect(page.url()).toContain(`#${secondOid}`)

    await page.goBack()
    await expect(report.rows().first()).toHaveAttribute('aria-current', 'true')
    expect(page.url()).toContain(`#${firstOid}`)

    await page.goForward()
    await expect(report.rows().nth(1)).toHaveAttribute('aria-current', 'true')
    expect(page.url()).toContain(`#${secondOid}`)
  })

  test('reads the report data from the inert JSON element only', async ({ report }) => {
    await report.open('ordinary')
    const data = report.page.locator('#gitlog-html-data')
    await expect(data).toHaveAttribute('type', 'application/json')
    const embedded = await data.evaluate((node) => JSON.parse(node.textContent ?? '{}'))
    expect(embedded.schemaVersion).toBe(1)
  })

  test('renders hostile commit text as inert text', async ({ report }) => {
    await report.open('edge-content')
    const { page } = report
    await expect(page.locator('#gitlog-html-app img')).toHaveCount(0)
    await expect(page.locator('#gitlog-html-app script')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toContainText("<script>alert('repo')")
    await report.rows().first().click()
    await expect(report.details()).toContainText("</script><script>alert('explanation')</script>")
    await report.expectNoPageOverflow()
  })

  test('keeps a long explanation and a long raw message inside the page', async ({ report }) => {
    await report.open('edge-content')
    await report.rows().first().click()
    await expect(report.details()).toBeVisible()
    await report.expectNoPageOverflow()

    await report.page.getByRole('tab', { name: 'Commit message' }).click()
    await expect(report.page.locator('.raw-message')).toBeVisible()
    await report.expectNoPageOverflow()
  })

  test('wraps an unbroken token instead of widening the page', async ({ report }) => {
    await report.open('edge-content')
    // The third commit's subject is a single token with no break opportunity.
    const summary = report.page.locator('.commit-row__summary').nth(2)
    await expect(summary).toContainText('supercalifragilistic')
    await report.expectNoPageOverflow()
  })
})
