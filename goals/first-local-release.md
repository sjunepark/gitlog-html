# Goal: First local release

Status: active
Planning scope: ROADMAP.md

## Original contract

Goal contract
- Outcome: Deliver the complete local first release of gitlog-html: a validated Go CLI, offline responsive report, and thin installed agent workflow.
- Goal state: goals/first-local-release.md
- Included results and sources (semantic results define scope; paths supply detail):
  - Stable project foundation and contracts — plans/foundation-and-contracts.md
  - Truthful Git history extraction — plans/git-history-extraction.md
  - Deterministic commit graph layout — plans/commit-graph-layout.md
  - Responsive accessible report interface — plans/svelte-report-interface.md
  - Safe standalone report CLI — plans/report-generation-cli.md
  - Hardened release candidate — plans/hardening-and-validation.md
  - Installed agent reporting workflow — plans/agent-skill-packaging.md
- Complete when: Every included result achieves its cited outcome and applicable completion criteria within its named semantic boundary; every PRODUCT.md success criterion has current evidence; repository-required validation and review pass; planning is truthful; Delivery finishes.
- Excluded: Public release publication and distribution.
- Authority: Execute only included results and necessary supporting work; record anything else and ask before scope expansion or external authority.
- Resume: Initialize this contract with $progress goal mode before work; recover it before every resume, continuation, compaction, or handoff; stop if recovery fails.
- Delivery: PR delivery — use $progress's PR lifecycle and the fewest sequential reviewable PRs; finish each through $create-pr and $address-pr-feedback before starting the next, including the final implementation slice.

## Authorized amendments

- Stable project foundation and contracts — schema v1, package boundaries,
  deterministic seams, the representative fixture, and baseline Go validation
  are implemented and reviewed.

## Execution status

### Completed included results

- Stable project foundation and contracts.
- Truthful Git history extraction.
- Deterministic commit graph layout.
- Responsive accessible report interface.

### Current in-scope result

Safe standalone report CLI.

### Next in-scope action

Implement strict command-line parsing and standalone report assembly from the
approved CLI contract.

### Evidence and blockers

- `codex/first-local-release` is the temporary non-production integration branch for the sequential PR lifecycle.
- Before every push, scan both Git history and the working tree with gitleaks using redacted output.
- Foundation validation: `gofmt`, `go test ./...`, and `go vet ./...` pass;
  shared-contract review findings were resolved before advancing the roadmap.
- Git extraction validation: repeated real-Git tests, the race detector, the
  full Go suite, `go vet ./...`, and diff checks pass. Required review findings
  for corrupt refs, parse context, and bounded output were resolved.
- Graph validation: example snapshots, generated-DAG invariants, a dense scale
  case and benchmark, a real-Git relation comparison, the full race suite, and
  `go vet ./...` pass. Required cross-module review findings were resolved.
- Report UI validation: a clean npm install, Svelte and TypeScript checks,
  component tests, Chromium desktop/mobile file-URL tests, automated
  accessibility checks, deterministic asset comparison, representative visual
  review, the full Go race suite, vet, workflow syntax, and diff checks pass.
  All material UI and integration review findings were resolved, including PR
  feedback for breakpoint selection, lossless explanation text, parent-edge
  boundary meaning, and stable touch targets.
- Report UI PR #2 merged into the integration branch as `3081131` after all
  Go, web, CodeRabbit, GitGuardian, secret, and independent review gates passed.
  All 36 CodeRabbit threads received pushed responses and were resolved.
- Supporting PR #3 was not merged after automated review found material
  correctness and security defects throughout the opaque third-party payload.
  Repairing that upstream tool would exceed this goal's authority. The local
  Claude-only installation remains ignored and is not part of the product or
  release branch.
