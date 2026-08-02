# gitlog-html

gitlog-html turns a bounded Git history into one interactive, offline HTML
report. It is designed first for agents presenting repository history to
non-developers and second for developers reading history on desktop or mobile
without a terminal.

## Status

The first local release is complete: the validated Go CLI, standalone
responsive report, and thin installed-agent workflow are delivered on the
local integration branch. [ROADMAP.md](ROADMAP.md) remains the source of truth
for current work and has no queued result.

## Development

Build and exercise the CLI with the standard Go toolchain. It intentionally has
no runtime dependency on Node:

    gofmt -w ./cmd ./e2e ./internal
    go test ./...
    go vet ./...

    go build ./cmd/gitlog-html
    ./gitlog-html --repo . --output git-history.html

Frontend source lives in `web/`. Its deterministic build is committed under
`internal/report/assets` so Go-only consumers do not need Node. Rebuild bundles
from `web/`; never edit generated assets directly:

    cd web
    npm ci
    npm run check
    npm test
    npm run build
    npm run test:e2e

## Confirmed product shape

- A Go CLI invokes the installed Git executable and generates one HTML file.
- The default history is equivalent to:

      git --no-replace-objects log --graph --oneline --decorate --all -n 10

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
  local packaging and the installed agent skill.
- [ROADMAP.md](ROADMAP.md) is the only project work queue.
