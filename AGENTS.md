# Repository Instructions

## Start here

- Read [PRODUCT.md](PRODUCT.md), [ARCHITECTURE.md](ARCHITECTURE.md), and
  [ROADMAP.md](ROADMAP.md) before implementation.
- Treat the linked document for a current or selected plan as the source of
  truth for its outcome, current state, and next action.
- Keep ROADMAP.md as the only project queue. Update plan state in place rather
  than appending session logs.

## Architectural boundaries

- Keep Git invocation, history semantics, graph topology, report serialization,
  security, and final file assembly in Go.
- Invoke the real Git executable without a shell. Do not parse ASCII graph
  output and do not substitute a native Git implementation.
- Keep Svelte and browser code presentation-only. It consumes the versioned
  report contract and performs no Git or network operations.
- Preserve the offline single-file invariant and treat commit messages,
  identities, refs, and explanations as untrusted text.
- Do not implement deferred features from PRODUCT.md unless a later approved
  plan or goal explicitly adds them.

## Frontend and UI ownership

- For HTML, CSS, Svelte, SVG presentation, responsive behavior, accessibility,
  motion, and visual review, invoke the $delegate-ui-to-claude workflow.
- Claude Code owns web/** and the UI-generated asset output end to end. Codex
  owns product scope, Go contracts, integration, security review, and final
  validation. Codex must route UI revisions back to the same Claude session
  instead of patching Claude-owned source.
- Before delegation, stabilize the report contract and follow the workflow's
  Claude-only, repository-scoped Impeccable provisioning checks. Never expose
  Impeccable to Codex.
- Use [docs/report-ui.md](docs/report-ui.md) as the approved product and visual
  specification. A Claude handoff must include its responsive states,
  accessibility criteria, editable paths, non-goals, and validation commands.
- Require browser iteration for representative desktop and mobile reports.
  Claude must not change Go/domain code; it reports contract changes for Codex
  to resolve.

## Validation and generated assets

- Follow [docs/verification.md](docs/verification.md) for the evidence required
  by each slice.
- Build frontend assets from web source; never edit compiled assets manually.
- Keep the committed frontend bundle synchronized with its source so a Go-only
  consumer can build the CLI without Node.
- After a reviewable implementation slice, run the code-review workflow and
  resolve material findings before marking its plan complete.
