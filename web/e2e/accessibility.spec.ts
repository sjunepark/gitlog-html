import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, reportUrl, test, type ReportName } from './support'

const FIXTURES: ReportName[] = [
  'ordinary',
  'dense',
  'edge-content',
  'bidi-controls',
  'empty-unborn',
  'detached-shallow'
]

async function scan(page: Page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
}

test.describe('automated accessibility checks', () => {
  for (const name of FIXTURES) {
    test(`${name} has no violations`, async ({ report }) => {
      await report.open(name)
      await report.settle()
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
    await report.settle()
    const results = await scan(report.page)
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })

  test('the raw message view has no violations', async ({ report }) => {
    await report.open('edge-content')
    await report.rows().first().click()
    await report.page.getByRole('tab', { name: 'Commit message' }).click()
    await report.settle()
    const results = await scan(report.page)
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })

  test('dark mode has no violations', async ({ report }) => {
    await report.page.emulateMedia({ colorScheme: 'dark' })
    await report.open('ordinary')
    await report.rows().first().click()
    await report.settle()
    const results = await scan(report.page)
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })

  test('the startup failure state has no violations', async ({ report }) => {
    await report.page.goto(reportUrl('unsupported-schema'))
    await report.settle()
    const results = await scan(report.page)
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })

  test('every commit control meets the touch-target floor', async ({ report }) => {
    await report.open('ordinary')
    const heights = await report.rows().evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height)
    )
    // Math.min() of an empty array is Infinity, which would pass silently.
    expect(heights.length).toBeGreaterThan(0)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
  })
})
