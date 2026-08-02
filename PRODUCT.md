# Product Definition

## Problem

Terminal Git graphs are compact and expressive for experienced developers, but
they are poor handoff artifacts. They require terminal access, assume Git
literacy, and do not leave room for an agent to explain why a commit mattered.

gitlog-html creates a portable visual account of how a repository changed. An
agent can generate it, attach explanations grounded in the commits, and give a
human one file that opens in an ordinary browser.

## Audience and priority

The primary reader is a non-developer receiving a repository-history report
from an agent. The report must explain history without requiring knowledge of
Git commands, hashes, or merge mechanics.

The secondary reader is a developer opening the report on a mobile device when
a terminal is unavailable. Developer-level metadata must remain accessible,
but it must not dominate the initial view.

The generating actor is an agent or developer with local access to the
repository and an installed Git executable.

## Primary journey

1. An agent selects a repository and history scope.
2. It inspects the visible commits and optionally writes a plain-text
   explanation for each commit.
3. It invokes gitlog-html with the explanation map.
4. The CLI creates one standalone HTML file.
5. A reader opens the file offline on desktop or mobile.
6. The reader follows the graph, selects commits, reads explanations first,
   and switches to raw Git messages when needed.

## Reader experience

The report opens with a compact repository heading and a chronological Git
graph. Each visible commit row presents:

- branch and merge topology;
- commit date and time;
- local branch, remote branch, and tag labels;
- the agent explanation when present, otherwise the commit subject.

Selecting a commit reveals:

- the complete explanation, when present;
- a toggle to the complete raw commit message;
- author and committer identity and timestamps;
- full and abbreviated object IDs;
- parent object IDs;
- refs that point at the commit.

The explanation is the default detail view. A missing or whitespace-only
explanation falls back to the commit subject without presenting an empty state.

## History semantics

The default selection is the most recent ten commits across all refs, matching
the intent of:

    git --no-replace-objects log --graph --oneline --decorate --all -n 10

The limit applies to commits total, not commits per branch. This can truncate
older graph lanes. The report must show that an edge continues outside the
visible slice rather than implying that the truncated commit is a root.

The caller can select all refs or the current branch and its ancestry and can
change the maximum commit count. Arbitrary revision expressions and date ranges
are deferred until a concrete need appears.

## First-release scope

Included:

- local repository discovery;
- all-refs and current-branch history selection;
- configurable positive commit limit;
- divergence, convergence, ordinary merges, and multi-parent merges;
- local, remote, tag, detached-HEAD, unborn-branch, and empty-history states;
- optional plain-text explanations keyed by full commit object ID;
- responsive, accessible, offline interaction;
- safe handling of untrusted commit and explanation text;
- a thin agent skill that orchestrates explanation generation and the CLI.

Deferred:

- full patch or file-diff display;
- hosted reports, sharing services, or synchronization;
- live repository updates after generation;
- history editing or Git mutations;
- search, advanced filtering, comparison, and arbitrary revision languages;
- Markdown or HTML explanations;
- replacing Git with go-git, libgit2, or another repository implementation;
- a general-purpose Git GUI.

## Product principles

- Explanation before Git mechanics: the human-oriented account is prominent;
  raw evidence remains one action away.
- Topology must be truthful: truncation, disconnected histories, and merges
  are represented rather than visually simplified into a false linear story.
- One file means one file: viewing never depends on a server, CDN, font,
  stylesheet, module, or network request.
- Mobile is a real layout: it is not a desktop canvas scaled down.
- Generated content is untrusted: commit text never becomes executable HTML.
- Scope stays focused: features are added only when they improve the confirmed
  reporting use cases.

## Success criteria

The first release is complete when:

- running the default command in a non-empty repository creates a report for
  the latest ten commits across all refs;
- a representative branch and merge history is visually equivalent in
  topology to Git's graph output;
- an optional explanation is initially visible and the exact raw message is
  reachable through the toggle;
- the report remains useful with no explanations;
- the generated file opens directly and works with networking disabled;
- representative desktop and mobile layouts pass visual and interaction
  review;
- keyboard navigation and screen-reader semantics expose every commit and
  detail without relying on the SVG;
- malicious-looking commit messages and explanations render as inert text;
- the CLI and installed skill can generate equivalent reports from the same
  inputs;
- all validation in [docs/verification.md](docs/verification.md) passes.
