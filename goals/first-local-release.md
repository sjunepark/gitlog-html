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

_None._

### Current in-scope result

Truthful Git history extraction.

### Next in-scope action

Implement the direct Git process adapter and temporary-repository harness, then
complete repository discovery, history parsing, refs, and boundary semantics.

### Evidence and blockers

- `codex/first-local-release` is the temporary non-production integration branch for the sequential PR lifecycle.
- Before every push, scan both Git history and the working tree with gitleaks using redacted output.
- Foundation validation: `gofmt`, `go test ./...`, and `go vet ./...` pass;
  shared-contract review findings were resolved before advancing the roadmap.
