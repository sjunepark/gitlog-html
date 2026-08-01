import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { reportUrl, test, webRoot } from './support'

/**
 * Retained visual evidence for review.
 *
 * These are deterministic captures, not a pixel-diff gate: fonts and text
 * rasterisation differ across machines, so a byte comparison would fail for
 * reasons that have nothing to do with the report. Reviewing the images is the
 * check; they are never regenerated without looking at them.
 */

const outDir = join(webRoot, 'screenshots')

test.describe('visual evidence', () => {
  test.beforeAll(() => {
    mkdirSync(outDir, { recursive: true })
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`principal states (${scheme})`, async ({ report }, testInfo) => {
      const device = testInfo.project.name
      const shot = (name: string) =>
        report.page.screenshot({ path: join(outDir, `${device}-${name}-${scheme}.png`) })

      await report.page.emulateMedia({ colorScheme: scheme })

      await report.open('ordinary')
      await shot('history')

      await report.rows().first().click()
      await report.details().waitFor()
      await report.page.waitForTimeout(320)
      await shot('selected-merge')

      await report.page.getByRole('tab', { name: 'Commit message' }).first().click()
      await report.page.waitForTimeout(120)
      await shot('raw-message')

      await report.open('dense')
      await shot('dense-lanes')

      await report.open('edge-content')
      await report.rows().first().click()
      await report.details().waitFor()
      await report.page.waitForTimeout(320)
      await shot('hostile-and-long')

      await report.open('detached-shallow')
      await shot('detached-shallow')

      await report.open('empty-unborn')
      await shot('empty-unborn')
    })
  }

  test('keyboard focus and startup failure', async ({ report }, testInfo) => {
    const device = testInfo.project.name
    await report.open('ordinary')
    await report.page.keyboard.press('Tab')
    await report.page.screenshot({ path: join(outDir, `${device}-keyboard-focus.png`) })

    await report.page.goto(reportUrl('unsupported-schema'))
    await report.page.screenshot({ path: join(outDir, `${device}-startup-failure.png`) })
  })
})
