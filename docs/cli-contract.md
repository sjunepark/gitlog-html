# CLI Contract

## Command

The executable is named gitlog-html.

    gitlog-html [flags]
    gitlog-html inspect [flags]

The default path generates a report. The `inspect` operation supports the
installed agent's independently meaningful selection and evidence step while
keeping Git invocation and history semantics in Go.

## Flags

### Repository

    --repo PATH

Repository or descendant path to inspect. Default: current directory. The CLI
asks Git for the top-level repository path and does not require the caller to
run at the root.

### History scope

    --scope all|current

Default: all.

- all selects the same ref universe as Git's --all revision option.
- current selects HEAD and its ancestry.

Both scopes disable replacement-object rewriting. A `refs/replace/*` ref is
still part of the `--all` ref universe, but it does not substitute another
object's contents or parents during discovery, selection, or inspection.

The enum prevents contradictory all/current flags. An unborn HEAD produces an
empty report instead of a crash. Arbitrary revision expressions are deferred.

### Commit limit

    --max-count N

Default: 10. N must be a positive integer no greater than 40,000. It limits
commits total across the selected history, matching Git's maximum-count
semantics. It is not applied per branch. Wider graph shapes can still reach the
cumulative layout safety budget before that commit ceiling.

### Explanations

    --descriptions PATH

Optional path to a UTF-8 JSON object whose keys are full commit object IDs and
whose values are plain-text explanations:

    {
      "012345...": "Introduced upload validation before work begins.",
      "abcdef...": "Merged the independent retry work into the main flow."
    }

Keys use lowercase hexadecimal syntax and are compared exactly as opaque IDs.
The reader does not assume an object-ID length, and “full” is enforced by exact
equality with the full IDs emitted by Git; a prefix never attaches.
Values must be strings. Whitespace-only values behave as absent.

Descriptions for commits outside the selected slice are ignored with a concise
warning so an agent can reuse a superset file. An unknown key never attaches by
prefix. Malformed JSON, duplicate keys, non-string values, or invalid UTF-8
fail generation.

### Output

    --output PATH

Default: git-history.html in the current directory.

The CLI refuses to replace an existing path unless --force is present. Even
with --force it refuses symlinks, directories, other non-regular targets, and
the inspected repository's Git directory, common directory, or worktree
control path. It writes a temporary sibling, flushes and closes it, then
renames it so failure before installation does not leave a partial report. The
same-directory rename is atomic on Unix-like systems. Go does not expose that
guarantee portably on every platform, so non-Unix installation uses the host
rename semantics after the same complete-write and target-safety checks.

    --force

Allows replacement of an existing regular output file, atomically on
Unix-like systems.

## Agent inspection

    gitlog-html inspect \
      [--repo PATH] \
      [--scope all|current] \
      [--max-count N] \
      [--oid FULL_OID] \
      [--patch]

Without `--oid`, inspection returns structured JSON containing the exact full
object IDs selected by the same loader used for report generation, in report
order, plus the truncation state. With `--oid`, the CLI first proves exact
membership in that selected slice and returns structured commit-message,
identity, parent, and changed-file evidence. `--patch` adds the bounded patch
and requires `--oid`.

Inspection invokes real Git without a shell, uses the CLI's sanitized process
environment and output limits, ignores replacement refs, and names Unicode
format and non-layout control runes before JSON serialization. Each evidence
request has a dedicated 4 MiB Git-output ceiling before serialization. It does
not accept arbitrary revision expressions. A missing or outside-slice object
ID cannot be used to inspect unrelated repository history.

## Examples

Default report:

    gitlog-html

Current branch with a larger slice:

    gitlog-html --scope current --max-count 50

Agent-enriched report:

    gitlog-html \
      --descriptions /path/to/descriptions.json \
      --output /path/to/history.html

Exact agent selection and evidence:

    gitlog-html inspect --scope all --max-count 10
    gitlog-html inspect --scope all --max-count 10 --oid 012345...

## Output and diagnostics

Successful generation stdout contains the resolved output path and a compact
summary of the included commits and warnings. Successful inspection stdout is
structured JSON intended for the installed local agent workflow.

Warnings go to stderr and do not change the success status when the report is
truthful and usable. Operational and validation errors include the attempted
operation and preserve relevant Git stderr without dumping unrelated process
state.

Exit behavior:

- 0: report generated successfully, possibly with warnings.
- 1: repository, Git, input, rendering, or output operation failed.
- 2: command-line usage was invalid.

Tests assert these categories; internal error types remain free to evolve.

## Behavioral edge cases

- Empty repository: generate an intentional empty-history report.
- Detached HEAD with scope current: show detached identity and HEAD ancestry.
- Detached HEAD with scope all: use all refs and record detached HEAD when it
  is included or identify it separately when it is outside the slice.
- Shallow repository: mark known shallow boundaries and never imply a complete
  root.
- Missing explanation file: fail with the resolved path.
- Output parent missing or unwritable: fail before changing an existing file.
- Git unavailable: identify Git as the missing runtime dependency.
