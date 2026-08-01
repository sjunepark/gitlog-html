# CLI Contract

## Command

The executable is named gitlog-html.

    gitlog-html [flags]

The initial command has one generation path. Subcommands are not introduced
until the product needs a second independently meaningful operation.

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

The enum prevents contradictory all/current flags. An unborn HEAD produces an
empty report instead of a crash. Arbitrary revision expressions are deferred.

### Commit limit

    --max-count N

Default: 10. N must be a positive integer. It limits commits total across the
selected history, matching Git's maximum-count semantics. It is not applied per
branch.

### Explanations

    --descriptions PATH

Optional path to a UTF-8 JSON object whose keys are full commit object IDs and
whose values are plain-text explanations:

    {
      "012345...": "Introduced upload validation before work begins.",
      "abcdef...": "Merged the independent retry work into the main flow."
    }

Keys are case-sensitive opaque IDs. The reader does not assume an object-ID
length. Values must be strings. Whitespace-only values behave as absent.

Descriptions for commits outside the selected slice are ignored with a concise
warning so an agent can reuse a superset file. An unknown key never attaches by
prefix. Malformed JSON, duplicate keys, non-string values, or invalid UTF-8
fail generation.

### Output

    --output PATH

Default: git-history.html in the current directory.

The CLI refuses to replace an existing path unless --force is present. Even
with --force it refuses symlinks, directories, and other non-regular targets.
It writes a temporary sibling, flushes and closes it, then atomically renames
it so failure does not leave a partial report.

    --force

Allows atomic replacement of an existing regular output file.

## Examples

Default report:

    gitlog-html

Current branch with a larger slice:

    gitlog-html --scope current --max-count 50

Agent-enriched report:

    gitlog-html \
      --descriptions /path/to/descriptions.json \
      --output /path/to/history.html

## Output and diagnostics

Successful stdout contains the resolved output path and a compact summary of
the included commits and warnings. Machine data belongs in the report rather
than stdout.

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

