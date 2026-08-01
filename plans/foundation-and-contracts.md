# Establish the project foundation and contracts

## Outcome

The empty workspace becomes a reproducible Go project with stable domain and
report contracts, a defined frontend build boundary, and enough fixtures for
backend and Claude-owned UI work to proceed independently without guessing at
shared interfaces.

## Current state

The workspace is not a Git repository and contains documentation only. Product,
architecture, CLI, Git, graph, report, UI, security, verification, and skill
decisions are recorded. No module path, source tree, lock file, build command,
schema types, or CI configuration exists.

## Next action

Initialize the repository and Go module, then add the smallest compiling command
and versioned report-domain packages without implementing Git extraction or UI.

## Scope

- Initialize Git in this workspace without creating a remote or publishing.
- Establish a Go module. If no canonical remote path is available, use a local
  module path suitable for development and defer the public install path to the
  release decision.
- Add the planned cmd and internal package boundaries from ARCHITECTURE.md.
- Define typed values for object IDs, scope, HEAD state, refs, people,
  timestamps, commits, parent visibility, explanations, warnings, and graph
  layout.
- Define the Go report schema version 1 and one representative,
  language-neutral JSON fixture outside web/**.
- Reserve TypeScript contract creation for Claude in the Svelte plan; Codex
  does not scaffold or edit web/** in this slice.
- Establish deterministic clock and nonce seams so report tests do not depend
  on wall time or randomness.
- Establish baseline Go formatting, test, and vet commands and document the
  later frontend-asset synchronization boundary without creating placeholder
  frontend output.
- Add a minimal ignore file for build and test output.
- Update README and ARCHITECTURE paths only where implementation proves the
  planned map inaccurate.

## Decisions

- Go's standard library is preferred unless a dependency removes durable
  complexity.
- Domain types do not contain CLI, Git-process, JSON-template, SVG, or DOM
  behavior.
- Object IDs are opaque strings validated from Git output, not fixed-length
  SHA-1 values.
- The report schema is explicit and versioned before any Svelte implementation
  begins.
- Frontend source remains Claude-owned; Codex may define contracts and fixtures
  but must not design or implement the Svelte interface in this slice.
- Generated frontend assets may initially be an explicit missing prerequisite;
  do not add hand-written placeholder bundles that become accidental source.

## Completion conditions

- The workspace is a Git repository with no unrelated generated content.
- The Go command and packages compile.
- Domain and report schema tests pass.
- A representative schema fixture expresses a merge, refs, an explanation,
  raw text, and a truncated parent.
- Backend packages can consume the fixture without depending on Svelte.
- The next Git extraction plan can implement against stable types.
- Documentation reflects actual entry-point paths.

## Validation

Run the established equivalents of:

    gofmt
    go test ./...
    go vet ./...

Review the schema fixture for HTML-looking text and non-ASCII content so later
consumers cannot assume simple ASCII.

## Out of scope

- Real Git invocation.
- Graph lane assignment.
- Svelte, HTML, CSS, or visual design.
- Final report generation.
- Public releases and skill installation.
