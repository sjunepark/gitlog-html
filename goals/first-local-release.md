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
- Safe standalone report CLI.
- Hardened release candidate.

### Current in-scope result

Installed agent reporting workflow.

### Next in-scope action

Complete independent review and clean validation for the installed workflow,
then deliver its final implementation PR and run the goal-level completion
audit.

### Evidence and blockers

- `codex/first-local-release` is the temporary non-production integration branch for the sequential PR lifecycle.
- Before every push, scan both Git history and the working tree with gitleaks using redacted output.
- PR #2 merged the responsive report interface into the integration branch at
  `30811316deb2f888377283af709042f9c653a8fe`.
- PR #3 was closed without merge. Its third-party Claude tooling payload is
  not part of the product or integration branch; the required project-scoped
  copy remains local and ignored for UI delegation only.
- PR #4 merged the standalone report CLI into the integration branch at
  `f470cc39039aa6ce949df40110a0a31338fe87f3`. Its final head passed Go, web,
  GitGuardian, gitleaks history and directory scans, supplemental secret scans,
  independent review, and the complete feedback workflow with no unresolved
  threads.
- PR #5 merged the hardened release candidate into the integration branch at
  `d32e85c30bff9c8ece35c980c4fcc8e02b7d4d02`. Its final head passed the full
  local review matrix, clean-checkout validation, Go and web CI, GitGuardian,
  gitleaks history and directory scans, supplemental secret scans, and the
  complete feedback workflow with no unresolved threads.
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
- CLI implementation and PR `#4` delivery are complete. Full Go, race, vet,
  build, cross-build, workflow, frontend, deterministic-asset, component, and
  desktop/mobile browser validation pass. Real generated artifacts prove
  default all-ref selection against an unmerged ref, current ancestry,
  explanation fallback, empty, detached, shallow, truncated, relocated-offline,
  and complete hostile-content behavior. All material review findings are
  resolved, and production UI source, compiled assets, and screenshots remain
  unchanged by the final artifact-test work.
- Hardening review identified three material Go risks: output could replace
  Git administrative files, wide graphs could amplify bounded history into
  excessive allocations, and the stdout limit did not stop its producer. The
  fixes now protect ordinary and linked-worktree storage, enforce a cumulative
  graph budget without replacing output, and cancel Git promptly at overflow.
  Full normal/race/vet/lint validation and independent follow-up security
  review pass. Chromium and WebKit offline/CSP/bidi hardening pass independent
  validation, including neutralized assistive strings and browser titles.
  The owning Claude session resumed after its quota reset and completed the
  merge-parent role labels, computed-accessibility probes, all-control bidi
  fixture, rebuilt assets, browser checks, and manual non-SVG review. The full
  matrix passes from detached clean commit `b0f7487`; generated assets and
  screenshots stay byte-current, and formal independent review has no material
  findings. PR delivery is complete.
- The repository-owned agent skill now validates through both its source and
  installed symlink. Its end-to-end test proves exact selection, explanations
  and fallback, linear and merge histories, hostile text, output collision,
  and prerequisite diagnostics. Two fresh agents generated representative
  reports without modifying the repository or leaking temporary explanation
  data, and both artifacts rendered offline through the Playwright file-URL
  harness. Independent review is clean after fixing Git-environment isolation,
  unborn-history handling, guarded installation, and terminal cleanup. The
  installed explanation workflow is intentionally validated on the local
  POSIX host; native non-POSIX orchestration is not claimed in this release.
  The complete Go, race, vet, lint, local/Linux/Windows build, skill, workflow,
  frontend, deterministic-asset, and Chromium/WebKit matrix passes from
  detached clean commit `ef71029`. Final PR delivery remains in progress.
