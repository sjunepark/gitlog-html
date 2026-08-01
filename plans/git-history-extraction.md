# Build truthful Git history extraction

## Outcome

The Go core can resolve repository state and obtain the exact bounded commit
DAG, metadata, raw messages, and refs required by the product while treating
Git as the semantic authority and exposing explicit, testable failures.

## Current state

Complete. The Go core invokes the installed Git executable directly through a
context-aware, environment-hardened runner; discovers branch, detached, unborn,
empty, and invalid repository states; and extracts bounded topological history,
refs, metadata, raw messages, and explicit parent boundaries. Real temporary
repositories cover the required history forms, alternate object formats when
supported, and corrupt loose and packed refs.

## Next action

None. The next roadmap result is deterministic commit graph layout.

## Scope

- Implement a context-aware process runner around os/exec with separate
  argument values, stdout, stderr, working-directory behavior, and typed exit
  errors.
- Detect missing Git and report it distinctly.
- Resolve ordinary, detached, unborn, empty, and invalid repository states.
- Implement all-refs and current-HEAD selections with explicit topological
  ordering and one global maximum count.
- Collect full object IDs, ordered parents, author and committer identities and
  timestamps, and complete raw messages through machine-readable delimiters.
- Collect and classify local branches, remote-tracking branches, lightweight
  tags, annotated tags, HEAD, and relevant other refs.
- Derive subjects without changing the raw-message evidence.
- Classify visible, maximum-count-truncated, shallow-boundary, and true-root
  parents.
- Return warnings only when a truthful report remains possible.
- Add integration fixtures created through the real Git executable with local
  config and fixed timestamps.

## Parsing rules

- Keep command output as bytes until record and field boundaries are parsed.
- Do not split records on newlines.
- Disable color, pager, signature presentation, and decoration formatting that
  is intended for humans.
- Do not parse git log --graph output.
- Preserve relevant Git stderr on failure but never environment variables.
- Do not invoke aliases, hooks, external diffs, or shell expansions.

## Error model

Model and test at least:

- Git unavailable;
- not a repository;
- unresolved or unsupported repository state;
- command failure with exit information;
- malformed machine record;
- invalid object ID from a supposedly structured field;
- cancellation or timeout.

The caller must be able to map usage-independent failures to CLI exit category
1 without inspecting error strings.

## Completion conditions

- Selected object IDs and order match the equivalent Git command for every
  fixture.
- Parent relations, refs, HEAD state, identities, timestamps, subjects, and raw
  messages are represented accurately.
- All refs means one combined bounded history, not a per-ref limit.
- Truncated and shallow parents are not reported as roots.
- Detached, unborn, empty, disconnected, and annotated-tag cases are covered.
- Alternate object-format tests run when supported and prove no SHA-1-length
  assumption.
- No implementation path shells out through a command string.

## Validation

    go test ./...
    go vet ./...

Inspect structured fixture output for a branch-and-merge repository and compare
its selected object IDs directly with Git. Run the required code-review
workflow before completing this plan.

Current evidence: repeated package tests, the race detector, the full Go test
suite, `go vet ./...`, and diff checks pass. The required review confirmed that
repository-state failures are not rendered as empty history, parse errors name
their Git source, and process plus metadata output is bounded; all material
findings were resolved.

## Out of scope

- Graph lanes and SVG.
- Explanation generation.
- Report HTML.
- Diffs or changed-file content in the report.
