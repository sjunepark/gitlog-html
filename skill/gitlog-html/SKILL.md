---
name: gitlog-html
description: Create and optionally explain a standalone offline HTML report of a local Git repository's commit history. Use when asked for a visual Git history, portable Git log, commit timeline, repository history report, or evidence-grounded non-developer explanations of commits.
---

# Create a Git history report

Produce one private, portable HTML file by orchestrating the installed
`gitlog-html` CLI. Keep Git selection, parsing, graph layout, and rendering in
the CLI.

## Prepare

1. Read [references/cli-reference.md](references/cli-reference.md) before
   selecting history or invoking the CLI.
2. If explanations are requested, also read
   [references/explanation-guidance.md](references/explanation-guidance.md).
3. Resolve the repository and an absolute output path. Use the CLI defaults of
   all refs and 10 commits unless the user asks for another scope or limit.
4. Check that Git and the CLI are available. Use
   [scripts/run-report.sh](scripts/run-report.sh) for narrow prerequisite
   diagnostics and invocation. Pass a repository-local executable with
   `--cli PATH` when it is not installed on `PATH`.
   Use the CLI's `inspect` operation for every selection and evidence request;
   do not invoke Git separately. The Go implementation owns repository
   discovery, history semantics, process isolation, and evidence bounds.
5. Do not add `--force` unless the user explicitly authorizes replacing the
   exact existing report. Never work around the CLI's target protections.

## Generate

1. Identify the exact selected full object IDs using the `inspect` command in
   the CLI reference. Keep the requested scope and total limit identical to the
   report invocation. For unresolved or empty current history, omit
   descriptions and let the CLI preserve its explicit repository diagnosis.
2. When explanations are requested, inspect evidence for each selected commit
   and write a JSON object in a task-owned temporary directory outside the
   worktree. Use a structured JSON serializer and restrictive permissions.
   Omit unsupported explanations instead of guessing.
3. Invoke the launcher, separating launcher and CLI arguments with `--`:

   ```sh
   /path/to/skill/scripts/run-report.sh -- \
     --repo /absolute/repository \
     --scope all \
     --max-count 10 \
     --output /absolute/report.html
   ```

   Add `--cli /path/to/gitlog-html` before `--` for a repository-local binary.
   Add `--descriptions /temporary/descriptions.json` only when explanation JSON
   exists.
4. Treat a nonzero exit as a failed report. Surface the launcher's or CLI's
   diagnostic and give the smallest useful recovery step; do not substitute a
   hand-built report.

## Verify and deliver

1. Confirm the resolved output is a nonempty regular HTML file and that it is
   the only artifact needed.
2. Open the report through an absolute `file://` URL with networking disabled.
   Confirm it renders and does not request external resources. If an in-app
   browser rejects local files, use an existing repository-approved local
   browser harness that supports file URLs. Do not upload the report, start a
   server, weaken browser security, or install new tooling for this check. If
   no suitable local browser is available, disclose that verification is
   blocked rather than claiming the report was opened.
3. Return the HTML file, not build output or explanation JSON. State whether
   explanations were attached or commit subjects were used as fallback.
4. Warn that the portable report can contain private commit messages,
   identities, refs, and explanations. Never publish, email, or otherwise send
   it to a third party without separate authorization.
5. Immediately before the final response, remove only the temporary directory
   created for this task. On failure, capture the CLI diagnostic first and then
   remove the directory. Never delete a shared or user-owned directory. If
   cleanup itself fails, disclose the exact retained path and its private-data
   risk.
