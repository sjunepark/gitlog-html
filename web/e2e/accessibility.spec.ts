import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, reportUrl, test, type ReportName } from './support'

const FIXTURES: ReportName[] = [
  'ordinary',
  'dense',
  'edge-content',
  'empty-unborn',
  'detached-shallow'
]

async function scan(page: Page) {
  // Contrast has to be measured on settled pixels, so every running animation
  // is allowed to finish before the scan starts.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})))
  })
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
}

test.describe('automated accessibility checks', () => {
  for (const name of FIXTURES) {
    test(`${name} has no violations`, async ({ report }) => {
      await report.open(name)
      const results = await scan(report.page)
      expect(
        results.violations.map((violation) => `${violation.id}: ${violation.help}`)
      ).toEqual([])
    })
  }

  test('the selected-details view has no violations', async ({ report }) => {
    await report.open('ordinary')
    await report.rows().first().click()
    await expect(report.details()).toBeVisible()
    const results = await scan(report.page)
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })

  test('the raw message view has no violations', async ({ report }) => {
    await report.open('edge-content')
    await report.rows().first().click()
    await report.page.getByRole('tab', { name: 'Commit message' }).click()
    const results = await scan(report.page)
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })

  test('dark mode has no violations', async ({ report }) => {
    await report.page.emulateMedia({ colorScheme: 'dark' })
    await report.open('ordinary')
    await report.rows().first().click()
    const results = await scan(report.page)
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })

  test('the startup failure state has no violations', async ({ report }) => {
    await report.page.goto(reportUrl('unsupported-schema'))
    const results = await scan(report.page)
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })

  test('every commit control meets the touch-target floor', async ({ report }) => {
    await report.open('ordinary')
    const heights = await report.rows().evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height)
    )
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
  })
})
