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
    // Contexts start with the network cut, so a report is loaded under the
    // condition it is actually read in: from a file, on a machine that may
    // have no connection. Watching for outgoing requests proves the report
    // does not try to reach the network; this proves it does not need to.
    offline: true,
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
    },
    {
      // A second engine for the release check, per docs/verification.md, on a
      // phone — which is where WebKit actually reaches readers, and where the
      // modal sheet, focus containment and touch targets carry the most risk.
      // It runs the common suites plus the mobile-dialog spec; the
      // desktop-only spec belongs to the desktop project, and the retained
      // screenshot set belongs to the approved Chromium projects, so neither is
      // rewritten or duplicated for engine coverage alone.
      name: 'webkit-mobile',
      testIgnore: [/desktop-details\.spec\.ts/, /screenshots\.spec\.ts/],
      use: {
        ...devices['iPhone 15'],
        // WebKit cannot navigate to a file URL while offline emulation is
        // active — `page.goto` fails with an internal error before the document
        // loads. It therefore loads under request monitoring, which already
        // proves nothing leaves the document, and the network is cut
        // immediately afterwards in the fixture's own offline check, which is
        // where every engine is proven to report navigator.onLine === false.
        offline: false
      }
    }
  ]
})
