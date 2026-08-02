# Distribution and Agent Skill

## Distribution model

The generator is a Go command with compiled frontend assets embedded in the
binary. A user running the binary needs Git but does not need Go, Node, Svelte,
Vite, or a server.

During development:

    go build ./cmd/gitlog-html

After a public module path and release process exist, installation can use Go's
normal install mechanism or platform release binaries. The first implementation
goal should produce reproducible local builds and a usable skill; publishing a
public release is not required unless separately authorized.

## Frontend build boundary

Frontend contributors use the web package and its lock file. Its production
build emits deterministic JavaScript and CSS into the Go report asset
directory. Those compiled assets are committed so downstream Go builds do not
need Node.

CI rebuilds the assets and fails when the working tree differs. Generated
assets are never edited manually and never treated as the frontend source of
truth.

## Skill purpose

The skill turns the CLI into an agent workflow. It helps an agent:

1. choose all refs or current branch and a commit limit;
2. identify the exact visible commits through the CLI's production selector;
3. inspect each commit's message, metadata, changed-file statistics, and diff
   evidence as needed;
4. write optional plain-text explanations grounded in that evidence;
5. save a temporary full-object-ID-to-text JSON map;
6. invoke gitlog-html;
7. verify that the report exists and opens;
8. return the report to the user.

The skill may use diffs to understand commits even though the generated report
does not embed diffs in the first release.

## Skill boundary

The skill must not:

- reimplement repository parsing or graph layout;
- copy the Go source into SKILL.md;
- require explanations;
- invent explanations when commit evidence is insufficient;
- render Markdown or HTML from explanations;
- upload, email, or publish a report without separate authorization;
- leave explanation files containing repository information in the worktree by
  default.

Missing explanations are a supported CLI path. The skill should state whether
it generated explanations or relied on commit subjects.

## Skill structure

    skill/gitlog-html/
      SKILL.md
      agents/
        openai.yaml
      references/
        explanation-guidance.md
        cli-reference.md
      scripts/
        run-report.sh

The executable remains an installed prerequisite or a repository-local binary.
A launcher may locate and invoke it and provide a useful installation error,
but it does not embed platform-specific binaries or duplicate product logic.
The POSIX launcher is a convenience only. Selection and explanation evidence
use the cross-platform Go CLI's `inspect` operation directly, so Git invocation,
history semantics, environment isolation, output bounds, and replacement-ref
handling stay behind the product boundary.

## Local development installation

Build the ignored repository-local executable from the repository root:

    go build -o ./gitlog-html ./cmd/gitlog-html

Install the skill for local development by linking the repository-owned
directory into the active Codex skills directory. Refuse to replace an existing
entry; inspect or remove it deliberately first if it is stale.

    skill_home="${CODEX_HOME:-$HOME/.codex}/skills"
    skill_target="$skill_home/gitlog-html"
    mkdir -p "$skill_home"
    if [ -e "$skill_target" ] || [ -L "$skill_target" ]; then
      printf 'Refusing existing skill target: %s\n' "$skill_target" >&2
    else
      ln -s "$(pwd)/skill/gitlog-html" "$skill_target"
    fi

The symlink keeps the installed workflow identical to the reviewed repository
source. This is a local development procedure, not public distribution. A
fresh Codex session is required to discover a newly installed skill.

## Explanation guidance

An explanation answers what materially changed and why it matters in language a
non-developer can understand. It should:

- stay grounded in the commit message and actual changes;
- distinguish direct evidence from interpretation;
- describe outcomes rather than list filenames;
- mention a merge as integration of lines of work, not as an ordinary feature;
- remain concise enough for details while allowing multiple paragraphs when a
  change needs context;
- avoid claims about business intent that the repository does not support.

The JSON uses full object IDs. Generate it in a temporary directory with safe
permissions. Immediately before the final response, remove only that
task-owned directory after capturing any failure diagnostic needed for
recovery; disclose the exact path and private-data risk if cleanup fails.

## Skill acceptance

- It triggers for requests to create or explain a visual Git history report.
- It can generate a report with and without explanations.
- Its selected object IDs match the CLI's configured scope and limit.
- It gives the reader the standalone HTML file, not a path to build assets.
- It reports Git or CLI prerequisites clearly.
- It follows the output overwrite policy and never silently replaces a report.
- Its instructions stay thin and route implementation details to the CLI and
  project documentation.
- Its selection and evidence path is owned by the cross-platform Go CLI rather
  than shell commands or duplicated Git semantics.
