import { expect, test } from './support'

// Runs only in the mobile project; see testIgnore in playwright.config.ts.
test.describe('mobile details sheet', () => {
  test('opens as a labelled modal with a visible close control', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    await report.rows().first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(
      'Merge quote builder into main'
    )
    await expect(dialog.getByRole('button', { name: /Close/ })).toBeVisible()
    await report.expectNoPageOverflow()
  })

  test('contains focus inside the dialog', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    await report.rows().first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Tab may cycle through the browser's own UI, which surfaces as focus on
    // <body>. What must never happen is focus reaching the history behind the
    // modal.
    for (let step = 0; step < 14; step += 1) {
      await page.keyboard.press('Tab')
      const where = await page.evaluate(() => {
        const active = document.activeElement
        const dialog = document.querySelector('dialog')
        if (active === null) return 'none'
        if (dialog?.contains(active) === true) return 'dialog'
        return active === document.body ? 'body' : (active.className || active.tagName)
      })
      expect(['dialog', 'body'], `focus escaped after ${step + 1} tab presses`).toContain(where)
    }
  })

  test('closes on the close control and hands focus back to the commit', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    const row = report.rows().first()
    await row.click()
    await page.getByRole('button', { name: /Close/ }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(row).toBeFocused()
    expect(new URL(page.url()).hash).toBe('')
  })

  test('closes on Escape and hands focus back to the commit', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    const row = report.rows().nth(2)
    await row.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(row).toBeFocused()
  })

  test('browser back changes the selected commit and eventually closes', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    await report.rows().first().click()
    // The modal covers the history, so the parent control is how a reader
    // actually moves to the next commit here.
    await page.getByRole('dialog').getByRole('button', { name: /Fixed a rounding problem/ }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText(
      'Tighten currency rounding in totals'
    )

    await page.goBack()
    await expect(page.getByRole('dialog').getByRole('heading', { level: 2 })).toHaveText(
      'Merge quote builder into main'
    )

    await page.goBack()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('following a parent stays inside the dialog and updates the title', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    const dialog = page.getByRole('dialog')
    await report.rows().first().click()
    await dialog.getByRole('button', { name: /Fixed a rounding problem/ }).click()

    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(
      'Tighten currency rounding in totals'
    )
    const inside = await page.evaluate(() => {
      const active = document.activeElement
      const element = document.querySelector('dialog')
      return active !== null && element !== null && element.contains(active)
    })
    expect(inside).toBe(true)
  })

  test('offers the explanation first and the commit message on request', async ({ report }) => {
    await report.open('ordinary')
    const dialog = report.page.getByRole('dialog')
    await report.rows().first().click()
    await expect(dialog.getByRole('tab', { name: 'Explanation' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await dialog.getByRole('tab', { name: 'Commit message' }).click()
    await expect(dialog.locator('.raw-message')).toContainText(
      'Brings the new quote builder onto main after review.'
    )
  })

  test('shows no toggle for a commit without an explanation', async ({ report }) => {
    await report.open('ordinary')
    const dialog = report.page.getByRole('dialog')
    await report.rows().nth(7).click()
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await expect(dialog.locator('.raw-message')).toBeVisible()
  })

  test('touch targets on the sheet controls stay reachable', async ({ report }) => {
    await report.open('ordinary')
    await report.rows().first().click()
    const close = report.page.getByRole('button', { name: /Close/ })
    const box = await close.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  })

  test('holds a gutter on both edges of the sheet header', async ({ report }) => {
    await report.open('ordinary')
    await report.rows().first().click()
    // Display cutouts cannot be emulated here, so this proves the fallback
    // gutter; tests/stylesheet.test.ts proves the inset itself.
    const padding = await report.page.locator('.sheet__head').evaluate((node) => {
      const style = getComputedStyle(node)
      return { left: Number.parseFloat(style.paddingLeft), right: Number.parseFloat(style.paddingRight) }
    })
    expect(padding.left).toBeGreaterThanOrEqual(16)
    expect(padding.right).toBeGreaterThanOrEqual(16)
    expect(padding.left).toBeCloseTo(padding.right, 1)
  })
})
