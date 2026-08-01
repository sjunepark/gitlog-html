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

### Current in-scope result

Responsive accessible report interface.

### Next in-scope action

Stabilize the UI handoff against schema v1, provision the repository-scoped
Claude workflow, and delegate the responsive accessible report implementation
with required browser iteration.

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
