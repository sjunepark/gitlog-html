import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests run against the standalone files in web/harness through file
 * URLs, because that is how a reader actually opens a report. No server is
 * started, and no test may depend on one.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    // Fixed locale and time zone keep dates, and therefore screenshots,
    // reproducible across machines.
    locale: 'en-GB',
    timezoneId: 'UTC',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile-details\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    {
      name: 'mobile',
      testIgnore: /desktop-details\.spec\.ts/,
      use: { ...devices['Pixel 7'] }
    }
  ]
})
