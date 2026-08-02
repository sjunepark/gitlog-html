# Git History Extraction

## Authority

The installed Git executable owns repository discovery, revision selection,
topological ordering, object identity, refs, and commit metadata. The program
does not reproduce these semantics with go-git or libgit2.

The adapter invokes Git directly with os/exec and an argument vector. It never
uses a shell, expands repository content into a command string, evaluates
aliases, invokes external diff tools, or parses terminal colors and graph
characters.

## Repository discovery

Given --repo, ask Git for the repository top level. Record a typed repository
state:

- ordinary branch with branch name and HEAD object ID;
- detached HEAD with object ID;
- unborn branch with branch name and no commit;
- invalid or inaccessible repository.

The display name defaults to the root directory basename. No remote URL is
embedded in the first release.

## Commit selection

For scope all, pass Git the all-refs selection. For scope current, select HEAD.
Use explicit topological ordering so merges are displayed before their parents
in a sequence suitable for graph lanes. Apply the maximum count once to the
combined result.

The result must match the commit set and ordering intent of:

    git --no-replace-objects log --graph --oneline --decorate --all -n N

The implementation adds a machine-readable pretty format and disables color
and signature presentation. It does not consume the visible command output.
Replacement refs are local presentation indirection rather than recorded
history. The CLI disables them for discovery, selection, report generation,
and agent evidence so every path sees stored commits and parents.

## Machine-readable records

Collect, at minimum:

- full object ID;
- ordered parent object IDs;
- author name, email, and ISO timestamp;
- committer name, email, and ISO timestamp;
- complete unwrapped commit message.

Use NUL-delimited fields and records rather than line parsing because names and
messages can contain newlines. Keep command output as bytes until record
boundaries are resolved, then decode text according to Git's output behavior.
Malformed records are explicit adapter errors with the command and record
position.

The main timeline displays the committer timestamp because it represents when
the commit entered the recorded history. Details also expose author time when
it differs.

Derive the subject from the first logical line of the raw message after
decoding. Preserve the full message separately, including paragraphs and
meaningful internal whitespace. Normalize only the final transport newline
that Git itself adds around formatted output; do not rewrap the message.

## Refs

Collect refs separately with Git's ref iteration command so presentation does
not have to parse decoration strings. Peel annotated tags to their commit
targets. Classify:

- local branches;
- remote-tracking branches;
- tags;
- other refs that directly identify a selected commit.

Store full names for evidence and concise display names for the report. Mark
HEAD independently rather than inferring it from decoration text. Sort labels
deterministically within each kind.

Refs whose target is outside the visible slice do not appear as commit labels.
They still influence selection under scope all through Git.

## Truncation and repository boundaries

After selection, compare every visible parent ID with the selected commit set:

- selected parent: ordinary visible edge;
- existing but unselected parent: maximum-count truncation;
- shallow boundary parent: shallow-history truncation;
- no parent: true root.

The history model must preserve these distinctions for the graph and details
view. A missing visible parent is never silently treated as a root.

## Domain types

Use explicit types for:

- object ID;
- history scope;
- HEAD state;
- ref kind;
- person identity and timestamp;
- commit message and optional explanation;
- parent visibility;
- warnings that still permit a truthful report.

Do not validate object IDs with a fixed SHA-1 length. Treat IDs emitted by Git
as opaque lowercase strings and test repositories using alternate object
formats when the installed Git supports them.

## Error model

Keep these failure categories distinguishable:

- Git executable unavailable;
- path is not a repository;
- repository state cannot be resolved;
- Git command exits unsuccessfully;
- machine record is malformed;
- commit text cannot be represented safely;
- caller cancellation or timeout.

An error includes the operation and safe stderr context. It must not include
environment variables or unrelated repository data.

## Test repositories

Integration fixtures created with the real Git executable cover:

- linear history;
- diverged branches and a non-fast-forward merge;
- multi-parent merge;
- local, remote-tracking, lightweight-tag, and annotated-tag refs;
- detached and unborn HEAD;
- empty repository;
- maximum-count truncation;
- shallow clone boundary when supported;
- disconnected orphan histories;
- Unicode, multiline, and HTML-looking identities and messages;
- alternate object format when supported.
