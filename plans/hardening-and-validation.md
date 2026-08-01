# Harden and validate the complete product

## Outcome

The integrated CLI and report satisfy the product acceptance criteria across
real Git repositories, malicious content, desktop and mobile browsers, clean
builds, and maintainable documentation, with all material review findings
resolved.

## Current state

docs/verification.md defines the target matrix. No implementation or evidence
exists. This plan begins only after the generator and UI can produce a complete
report.

## Next action

Create the end-to-end fixture matrix and make one command sequence reproduce a
clean build, asset verification, Go tests, frontend tests, and file-URL browser
tests.

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

- Every success criterion in PRODUCT.md has linked evidence.
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

## Out of scope

- Publishing a public release.
- New product features discovered during validation.
- Skill packaging, which has its own final plan.

