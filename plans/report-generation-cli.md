# Assemble the standalone report and CLI

## Outcome

The Go command combines real repository history, optional explanations,
deterministic graph layout, and Claude-built assets into one safe, offline HTML
report through the approved CLI, with atomic installation on Unix-like systems.

## Current state

Complete. PR #4 merged the reviewed CLI and standalone report into
`codex/first-local-release`. The strict CLI, description reader, generation
coordinator, standalone renderer, and sibling-file writer consume the completed
Git, graph, schema, and committed UI assets. All material implementation and PR
review findings were resolved.

## Next action

None — outcome complete.

## Scope

- Implement --repo, --scope, --max-count, --descriptions, --output, and
  --force exactly as documented.
- Validate optional explanation JSON, including duplicate keys, UTF-8, full
  object IDs, string values, blank values, and unknown selected-slice keys.
- Attach explanations without changing raw commit messages.
- Convert the domain and graph models into schema version 1.
- Embed the committed IIFE and CSS assets into the Go binary.
- Assemble metadata, nonced CSP, CSS, report JSON, application root, fallback
  content, and JavaScript into one UTF-8 document.
- Keep report startup failure readable.
- Refuse unsafe output targets and write through a sibling temporary file,
  installing atomically where the host provides same-directory atomic rename.
- Emit concise success output, warnings, privacy reminder, and typed exit
  categories.
- Add build-version information when it can be supplied without making local
  builds nondeterministic or misleading.

## Security cases

Tests must generate reports containing:

- closing-script and style sequences;
- event-handler and image-like markup;
- quotes, ampersands, backslashes, and Unicode separators;
- bidirectional and multiline text;
- hostile-looking ref and identity values;
- an existing regular output, symlink, directory, and failed temporary write.

Open the malicious-content report in a browser with console and network
monitoring. The text must remain inert, CSP must not produce unexplained
violations, and no request may leave the document.

## Completion conditions

- Default invocation implements the confirmed all-refs ten-commit behavior.
- Current scope and custom positive limits work.
- Reports with and without explanation files behave as documented.
- Empty, detached, unborn, shallow, and truncated states generate truthful
  documents.
- The report can be moved away from the repository and opened directly.
- No external asset or runtime dependency remains in the HTML.
- Existing files are protected unless force is explicit, and symlinks are
  always refused.
- Exit status and diagnostics match the CLI contract.
- A Go-only consumer can build the CLI from committed frontend assets.

## Validation

    go test ./...
    go vet ./...

Run the frontend asset stale check and browser artifact assertions from
docs/verification.md. Generate representative real reports for visual
integration review. UI defects are routed back to the Claude session; Go
integration defects remain Codex-owned. Run code review before completion.

Current evidence: formatting, the full Go suite, race detection, vet, normal
and cross-platform builds, workflow syntax, frontend checks, component tests,
deterministic asset generation, and the complete desktop/mobile file-URL suite
pass. Real CLI reports prove default all-ref selection, current ancestry,
explanation fallback, empty, detached, shallow, truncated, relocated-offline,
and malicious-content behavior. Production UI source, compiled assets, and
screenshots remain unchanged by the artifact-test additions.

## Out of scope

- Public release publication.
- Embedded patches or diffs.
- Automatic browser opening.
- Hosted viewing.
