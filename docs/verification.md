# Verification Strategy

## Quality bar

Validation must prove Git fidelity, graph truthfulness, standalone-file
behavior, frontend usability, and safe content handling. Unit tests alone are
insufficient because the product crosses real Git, generated HTML, and browser
behavior.

Every implementation plan records the commands and evidence relevant to its
slice. The final release candidate runs the complete matrix below.

## Go validation

Expected baseline commands after the foundation plan establishes the module:

    go test ./...
    go vet ./...

Tests cover:

- flag validation and exit categories;
- explanation JSON validation and attachment;
- Git record parsing and typed errors;
- real temporary repositories for history semantics;
- graph example snapshots and invariants;
- schema serialization and unsupported-version behavior;
- HTML escaping and content-policy generation;
- output collision, force, symlink, Git-administrative-path refusal,
  failed-write preservation, and the Unix-like same-directory atomic-install
  boundary;
- prompt child termination at the Git output ceiling and graph-complexity
  rejection without output replacement.

The release-candidate matrix runs `go test -race ./...`. Do not add concurrency
merely to justify race testing.

## Frontend validation

The web package should expose stable scripts for:

    npm ci
    npm run check
    npm test
    npm run build
    npm run test:e2e

The exact script implementations are selected during the UI plan. They must
cover TypeScript and Svelte checking, component behavior, deterministic asset
generation, and browser flows.

Claude Code performs UI implementation and visual iteration. Codex independently
checks the resulting contract integration and routes UI findings back to the
same Claude session.

## Git integration fixtures

Create repositories at test time with explicit local identity and timestamps.
Do not depend on the developer's global Git configuration.

Fixture histories cover the cases listed in git-history.md and graph-layout.md.
For each fixture:

- compare selected object IDs and order with the equivalent Git command;
- compare the graph relationship set with Git parent IDs;
- assert ref classification and HEAD state;
- verify roots and truncation boundaries remain distinct;
- generate a report and open it in the browser suite.

Capability-dependent cases such as alternate object formats and shallow local
clones are skipped only with an explicit reason.

## Browser matrix

Exercise the final file through a file URL, not only through the Vite server.
Representative desktop and narrow mobile viewports cover:

- initial load with networking disabled;
- commit selection by pointer and keyboard;
- explanation-first and raw-message behavior;
- fragment initialization, back, and forward;
- close and focus restoration for mobile details;
- empty, detached, truncated, dense-lane, and long-content states;
- light, dark, reduced-motion, increased text size, and visible focus;
- no external requests, console errors, CSP violations, or page overflow.

Use Chromium for the broad suite and at least one additional browser engine for
the final release check. Capture stable screenshots for the principal desktop
and mobile fixtures. Screenshot changes require intentional visual review,
not blind snapshot updates.

Run automated accessibility checks and supplement them with keyboard and
reading-order inspection. Automated checks cannot prove that merge topology is
understandable.

## Standalone artifact assertions

Inspect a generated report to prove:

- exactly one output file is required;
- no script src, stylesheet link, external font, or dynamic import remains;
- no runtime request occurs;
- compiled CSS, IIFE JavaScript, and report JSON are present;
- malicious fixture text appears inert and readable;
- the report works after being moved away from the repository;
- generated assets in the Go binary match the current web build.

## Performance

Measure generation and interaction on the default slice and a deliberately
larger configured slice. The acceptance criterion is responsive human use, not
a synthetic benchmark target. Record regressions when graph or DOM work grows
faster than the selected commit count and lane transitions justify.

## Final completion evidence

Before the roadmap is complete:

- all plan completion conditions are met;
- the full Go and frontend suites pass from a clean checkout;
- generated assets are current;
- representative reports are visually reviewed on desktop and mobile;
- the installed skill generates and returns a working report;
- the implementation receives the required code review and material findings
  are resolved;
- README and architecture paths match the implemented repository.
