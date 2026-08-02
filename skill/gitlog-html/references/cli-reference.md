# CLI reference

## Selection contract

Use `--scope all` by default. It selects commits reachable from all refs. Use
`--scope current` only when the user asks for the current branch or current
`HEAD` ancestry. The default `--max-count` is 10; it limits the total selected
commits, not each branch, and must be between 1 and 40,000.

Before writing explanations, obtain the visible full object IDs from the same
Go selector used by report generation. Resolve `/path/to/skill` to this skill
directory and invoke the CLI through the launcher:

```sh
/path/to/skill/scripts/run-report.sh -- inspect \
  --repo /absolute/repository \
  --scope all \
  --max-count 10
```

The JSON `oids` array contains exact selected full object IDs in report order.
For current scope, pass `--scope current`. An empty array is a valid unborn or
empty selection; omit descriptions. Preserve any nonzero CLI diagnostic. Do
not replace selection with per-branch Git logs, ASCII graph parsing, or direct
Git invocation.

## Invocation

The launcher accepts an optional executable and passes every argument after
`--` directly to the CLI:

```sh
/path/to/skill/scripts/run-report.sh \
  [--cli /path/to/gitlog-html] -- \
  --repo /absolute/repository \
  --scope all \
  --max-count 10 \
  --output /absolute/report.html \
  [--descriptions /private/temporary/descriptions.json] \
  [--force]
```

The launcher first checks Git, then uses the explicit `--cli` path, an
installed `gitlog-html`, or an executable named `gitlog-html` at the root of a
development checkout containing this skill. It does not parse repositories,
select commits, or render output.

On a host without a POSIX shell, perform the same prerequisite checks and
invoke `gitlog-html` directly, including its `inspect` operation. The launcher
adds no product behavior and is not required for report correctness.

The CLI refuses to replace an existing output unless `--force` is present.
Even with `--force`, it rejects unsafe targets and Git administrative paths.
Choose a new output name by default and preserve these errors.

## Local recovery

If Git is missing, install Git for the host and retry. If `gitlog-html` is
missing in a source checkout, build the repository-local executable from the
repository root:

```sh
go build -o ./gitlog-html ./cmd/gitlog-html
```

Then pass `--cli /absolute/repository-root/gitlog-html` to the launcher. A user
of an installed binary does not need Go or Node.

Exit status 2 means invalid CLI usage. Exit status 1 means repository, Git,
input, rendering, or output failure. Preserve stderr because it names the
failed operation. Warnings can accompany a successful report.

## Delivery checks

Resolve the output to an absolute path and confirm it is a nonempty regular
file. Open that exact file through a `file://` URL with networking disabled.
The report is standalone: do not return the skill directory, compiled assets,
or the temporary explanation map.
