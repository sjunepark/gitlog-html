# gitlog-html

gitlog-html will turn a bounded Git history into one interactive, offline HTML
report. It is designed first for agents presenting repository history to
non-developers and second for developers reading history on desktop or mobile
without a terminal.

## Status

Product and architecture decisions are documented. Implementation has not
started. The workspace is not yet initialized as a Git repository.

The next implementation run should begin with [ROADMAP.md](ROADMAP.md) and the
first queued plan rather than reconstructing scope from conversation history.

## Confirmed product shape

- A Go CLI invokes the installed Git executable and generates one HTML file.
- The default history is equivalent to:

      git log --graph --oneline --decorate --all -n 10

- The commit limit and all-refs/current-branch scope are configurable.
- The report visibly preserves branch divergence and merge convergence.
- Each commit emphasizes date/time and a short explanation of what changed.
- Agent-written explanations are optional, plain text, and shown first.
- The full raw commit message is available through a toggle.
- The report works offline through a file URL on desktop and mobile.
- Full patches and diffs are deferred beyond the first release.

## Implementation shape

Go owns repository inspection, the history model, graph lane assignment, safe
serialization, CLI behavior, and final document assembly. Svelte 5 and
TypeScript own the report interface. Vite compiles the UI to one JavaScript
bundle and one stylesheet, which the Go binary embeds and inlines into every
report.

SvelteKit, a web server, a native Git library, runtime network access, and
external report assets are outside the design.

## Documentation map

- [PRODUCT.md](PRODUCT.md) defines users, experience, scope, and acceptance.
- [ARCHITECTURE.md](ARCHITECTURE.md) maps the system and its invariants.
- [docs/cli-contract.md](docs/cli-contract.md) specifies the command interface.
- [docs/git-history.md](docs/git-history.md) specifies Git extraction.
- [docs/graph-layout.md](docs/graph-layout.md) specifies topology and lanes.
- [docs/report-format.md](docs/report-format.md) specifies the standalone file.
- [docs/report-ui.md](docs/report-ui.md) specifies interaction and visual design.
- [docs/security.md](docs/security.md) defines trust boundaries and controls.
- [docs/verification.md](docs/verification.md) defines required evidence.
- [docs/distribution-and-skill.md](docs/distribution-and-skill.md) defines
  packaging and the eventual agent skill.
- [ROADMAP.md](ROADMAP.md) is the only project work queue.

