import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests run against the standalone files in web/harness through file
 * URLs, because that is how a reader actually opens a report. No server is
 * started, and no test may depend on one.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  // Builds the real CLI and generates reports from real repositories once,
  // before any worker starts. See e2e/generate-reports.ts.
  //
  // A setup project would be the alternative, but it buys nothing here: the
  // generator needs no fixtures and no trace, and generated-reports.spec.ts
  // imports its constants and types from that same module — converting it into
  // a spec would register a test as an import side effect. Discovery is the one
  // case global setup does not cover, because `--list` and IDE explorers
  // collect without running it; that spec reads its manifest lazily for exactly
  // that reason.
  globalSetup: './e2e/generate-reports.ts',
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
