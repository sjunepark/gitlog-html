# Security and Trust Boundaries

## Threat model

The generator runs locally, but repository content is not trusted. A cloned
repository can contain hostile names, ref labels, identities, commit messages,
object topology, encodings, and very large content. Explanation JSON can also
contain hostile text.

The main risks are:

- shell or argument injection while invoking Git;
- HTML or script injection in the generated report;
- unexpected network access when a report opens;
- overwriting an unintended output target;
- misleading topology caused by malformed or truncated data;
- resource exhaustion from unusually large histories or messages;
- accidental disclosure when a report is shared.

The first release does not claim isolation from a fully malicious local Git
executable or operating system. The caller must also control the output
directory while generation is in progress; defending the final rename against
a separate local process racing to replace directory entries is outside this
release's threat model.

## Process execution

- Resolve Git through the normal executable path and invoke it with os/exec.
- Pass every command argument separately; never invoke a shell.
- Use explicit Git subcommands rather than aliases.
- Do not enable hooks, external diff drivers, text converters, pagers, or
  signature UI.
- Set environment only where stable machine output requires it and inherit no
  secret into report content.
- Capture bounded, relevant stderr for errors without serializing the process
  environment.
- Support caller cancellation and terminate child processes cleanly.

## Content handling

- Treat every repository and explanation string as data.
- Encode the report model with Go's JSON encoder and preserve HTML-safe
  escaping.
- Use ordinary Svelte text interpolation and DOM properties.
- Forbid raw HTML rendering for dynamic content.
- Keep explanations plain text.
- Test closing-script sequences, event-handler markup, quotes, backslashes,
  control-like Unicode, bidirectional text, and multiline content.
- Display object IDs and refs as text; do not construct commands or external
  links from them.

## Content security policy

Generate a per-document nonce and apply a restrictive policy:

- deny all sources by default;
- permit only nonced inline style and script elements;
- deny connect, frame, object, base, and form behavior;
- permit data images only if the final design actually needs them.

The data script receives the nonce even though it is non-executable. The report
contains no external URL that CSP must allow. CSP supplements escaping and
does not replace it.

## Output safety

- Refuse an existing path unless --force is explicit.
- Resolve the output parent before writing.
- Refuse symlink and non-regular replacement targets.
- Create a temporary sibling with restrictive creation semantics.
- Flush and close before a same-directory rename. That final installation is
  atomic on Unix-like systems; on other platforms it follows the host rename
  semantics only after the same complete-write checks.
- Remove only the temporary file created by the failed invocation.
- Refuse output within the resolved Git directory, common directory, or
  worktree control path even when --force is explicit.
- Never modify Git administrative storage for the inspected repository,
  including linked-worktree metadata. The report itself may be written into
  the repository working tree.

## Truthfulness

- Preserve full parent IDs and distinguish true roots from maximum-count and
  shallow boundaries.
- Surface parser, unsupported-schema, and incomplete-history conditions rather
  than drawing invented topology.
- Do not label an agent explanation as raw evidence.
- Do not claim an explanation exists when it is missing or blank.

## Privacy

Reports can contain private names, emails, branches, messages, and agent
interpretations. Generation prints a concise reminder that the output is a
portable snapshot and should be reviewed before sharing.

The report contains no remote URL, absolute repository path, environment
variable, Git config, or source diff in the first release. The eventual skill
must not upload the report or explanations unless the user separately requests
and authorizes that action.

## Resource limits

The configurable commit limit bounds ordinary work, Git stdout and stderr have
byte ceilings, and crossing the stdout ceiling terminates the producer rather
than merely truncating storage. Graph materialization has a cumulative
lane-and-transition complexity budget so unusually wide histories cannot turn
bounded Git output into quadratic report allocations. Limit failures retain a
bounded prefix only for diagnostics and never install partial output.

Diff inclusion is deferred partly because it materially changes privacy and
size risks.
