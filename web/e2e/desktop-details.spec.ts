import { expect, test } from './support'

// Runs only in the desktop project; see testIgnore in playwright.config.ts.
test.describe('desktop split layout', () => {
  test('keeps the timeline dominant and the details pane sticky', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    await report.rows().first().click()

    const history = await page.locator('.history').boundingBox()
    const pane = await page.locator('.details-pane').boundingBox()
    expect(history!.width).toBeGreaterThan(pane!.width)
    await expect(page.locator('.details-pane')).toHaveCSS('position', 'sticky')
    // The graph is never covered by the details region.
    expect(history!.x + history!.width).toBeLessThanOrEqual(pane!.x + 1)
  })

  test('uses no dialog on a wide screen', async ({ report }) => {
    await report.open('ordinary')
    await report.rows().first().click()
    await expect(report.page.getByRole('dialog')).toHaveCount(0)
    await expect(report.page.getByRole('complementary', { name: 'Commit details' })).toBeVisible()
  })

  test('announces the selected commit politely, once', async ({ report }) => {
    await report.open('ordinary')
    const status = report.page.locator('[role="status"]')
    await expect(status).toHaveCount(1)
    await report.rows().nth(1).click()
    await expect(status).toContainText('Showing details for')
  })

  test('shows no container at all before a commit is chosen', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    await expect(page.locator('.details')).toHaveCount(0)
    await expect(page.locator('.details-pane__hint')).toContainText('Choose a commit')
    await expect(page.locator('.details-pane')).toHaveCSS('border-top-width', '0px')
  })

  test('following a parent selects it and moves focus to its commit', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    await report.rows().first().click()
    await page.locator('.details-pane').getByRole('button', { name: /Fixed a rounding problem/ }).click()

    await expect(report.rows().nth(1)).toHaveAttribute('aria-current', 'true')
    await expect(report.rows().nth(1)).toBeFocused()
    await expect(page.locator('.details-pane__subject')).toHaveText(
      'Tighten currency rounding in totals'
    )
  })

  test('states a parent outside the report without offering a broken control', async ({
    report
  }) => {
    await report.open('detached-shallow')
    const { page } = report
    await report.rows().nth(2).click()
    const outside = page.locator('.parents__outside')
    await expect(outside).toContainText('Not in this copy of the repository')
    await expect(outside.locator('button')).toHaveCount(0)
  })

  test('aligns each graph node with the commit row it describes', async ({ report }) => {
    await report.open('ordinary')
    const { page } = report
    const misaligned = await page.evaluate(() => {
      const svg = document.querySelector('svg.graph')
      const rows = [...document.querySelectorAll('.history__item')]
      if (svg === null) return ['no graph']
      const svgTop = svg.getBoundingClientRect().top
      const nodes = [...svg.querySelectorAll('circle.node')]
      if (nodes.length !== rows.length) return [`node count ${nodes.length} vs ${rows.length}`]
      const problems: string[] = []
      nodes.forEach((node, index) => {
        const centre = svgTop + Number.parseFloat(node.getAttribute('cy') ?? '0')
        const box = rows[index]!.getBoundingClientRect()
        if (centre < box.top || centre > box.bottom) {
          problems.push(`node ${index} at ${centre} outside row ${box.top}-${box.bottom}`)
        }
      })
      return problems
    })
    expect(misaligned).toEqual([])
  })

  test('hides the graph from assistive technology because the controls carry it', async ({
    report
  }) => {
    await report.open('ordinary')
    await expect(report.page.locator('svg.graph')).toHaveAttribute('aria-hidden', 'true')
    const label = await report.rows().first().getAttribute('aria-label')
    expect(label).toContain('Commit 1 of 10')
    expect(label).toContain('Merge of 2 commits')
  })
})
