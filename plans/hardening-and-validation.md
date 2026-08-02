# Harden and validate the complete product

## Outcome

The integrated CLI and report satisfy the product acceptance criteria across
real Git repositories, malicious content, desktop and mobile browsers, clean
builds, and maintainable documentation, with all material review findings
resolved.

## Current state

The integrated CLI and report now cover the real-Git, graph, standalone-file,
hostile-content, accessibility, desktop, and mobile paths required by the
earlier slices. Hardening review found and resolved repository-administration
output corruption, graph resource amplification, and non-terminating Git
output-limit behavior; the follow-up security review is clean. Warm local CLI
measurements on default and larger real-Git slices remain interactive, the
accepted wide-graph benchmark is bounded, and a Go-only build succeeds with
Node absent. Chromium and WebKit file-URL suites now prove offline operation,
CSP monitoring, responsive behavior, and bidi-neutral derived labels and tab
titles. The delegated merge-parent revision now names the first-parent history
as "Continues from" and the remaining histories as "Also merges"; component,
computed-accessibility, Chromium/WebKit, and manual non-SVG review are clean.
The complete release matrix passes from detached clean commit `b0f7487`,
generated assets and screenshots remain byte-current, and independent
implementation, security, system, design, accessibility, and visual reviews
report no material findings. PR #5 feedback was resolved at `7ab6a83`; its
updated Go, web, GitGuardian, and CodeRabbit checks passed, and the reviewed
slice merged into the integration branch at `d32e85c`.

## Next action

No remaining action within this plan. The installed agent workflow owns the
remaining first-release work.

## Scope

- Consolidate real Git fixtures across extraction, graph, report, and browser
  tests without hiding important cases behind oversized helpers.
- Run selected-object and ordering comparisons against Git.
- Exercise file-URL reports in the required browser engines and viewports.
- Add network-denial, CSP, malicious-content, move-the-file, and stale-asset
  assertions.
- Add automated accessibility checks plus manual keyboard, focus, zoom, and
  reading-order review.
- Capture and intentionally approve representative desktop/mobile screenshots.
- Measure generation and interaction on default and larger configured slices.
- Test a clean Go-only build without Node after assets are committed.
- Test a clean frontend rebuild from its lock file and prove deterministic
  output.
- Reconcile README, architecture, CLI, and design docs with implemented
  behavior; remove plans or claims that implementation invalidated.
- Run a full code and architecture review, resolve material findings, and
  repeat affected validation.

## Defect ownership

- Git, domain, graph, schema, renderer, security, and CLI findings are fixed by
  Codex-owned implementation.
- HTML, Svelte, CSS, SVG, accessibility, responsive, interaction, and visual
  findings return to the same Claude session under the delegation workflow.
- Cross-layer contract problems are resolved by Codex first, then handed back
  to Claude for adaptation.

## Completion conditions

- Every CLI/report success criterion in PRODUCT.md has linked evidence. The
  installed-skill equivalence criterion is fulfilled by the final agent-skill
  plan and remains recorded in the goal-level evidence.
- All required commands pass from a clean checkout.
- Generated assets are reproducible and current.
- Browser reports work offline after being moved.
- No known high-impact security, topology, accessibility, or data-loss issue
  remains.
- Default and larger histories remain responsive enough for human use.
- The documentation map and actual repository agree.
- Review findings are resolved or recorded as explicit, user-approved deferred
  work outside the first release.

## Validation

Run the complete matrix in docs/verification.md and retain concise command and
artifact evidence in this plan's Current state when completed. Do not paste
full logs or session transcripts.

### Product evidence ledger

- Default all-ref selection and the latest bounded slice: real CLI fixtures in
  `web/e2e/generated-reports.spec.ts`, cross-checked by the Git integration
  suite.
- Truthful divergence, convergence, merges, roots, and truncation: graph
  snapshots, generated-DAG invariants, real-Git relation comparison, and dense
  browser fixtures.
- Explanation-first details, exact raw messages, and explanation-free fallback:
  component tests plus desktop/mobile generated-report flows.
- Direct, moved, offline file use: standalone artifact assertions, request and
  CSP monitoring, offline browser contexts, and Chromium/WebKit file-URL runs.
- Responsive visual and non-visual access: reviewed desktop/mobile screenshots,
  keyboard/focus/dialog flows, semantic ordered-list controls, SVG exclusion
  from the accessibility tree, automated accessibility checks, zoom/text-size,
  dark, and reduced-motion states.
- Hostile content: Go escaping/CSP tests and browser fixtures prove markup stays
  inert; visible isolated markers preserve and expose bidi controls across
  names, branches, subjects, refs, and identities, while flat assistive strings
  and the browser title replace controls with explicit short names.
- Installed-skill equivalence: the final agent-skill plan proves installed-path
  report generation with exact Go-owned selection, optional explanations,
  hostile text, merges, failure diagnostics, and offline file-URL rendering.

### Performance observations

On the release-validation Apple M1 Pro, warmed real-Git generation remained
approximately one eighth of a second for both the default slice and a linear
500-commit slice; the reports were roughly 94 KB and 486 KB. A separate
500-commit history with periodic merges mounted in headless Chromium in about a
tenth of a second and settled a mid-list selection in about two animation
frames. The accepted wide-octopus benchmark stays within the graph budget, and
wider adversarial input now fails contextually before output installation.
These are observational baselines, not hardware-dependent CI thresholds.

### Clean-checkout evidence

Detached commit `b0f7487` passes formatting, the full Go and race suites, vet,
golangci-lint, local/darwin, Linux amd64, and Windows amd64 builds, a Go build
with Node absent, and workflow YAML parsing. A clean `npm ci` reports no known
vulnerabilities; Svelte/TypeScript checks, 203 component tests, 214 browser
tests, and deterministic asset checks pass. The three WebKit skips are the
documented platform-preference/synthetic-resize cases covered in Chromium.
Rebuilding leaves committed assets and screenshots unchanged.

## Out of scope

- Publishing a public release.
- New product features discovered during validation.
