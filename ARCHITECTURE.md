# Architecture

## Purpose and boundary

gitlog-html is a local report compiler. It reads immutable Git history through
the installed Git executable, combines optional human-oriented explanations,
computes a display model, and writes one self-contained interactive HTML file.

The generator does not host a site, mutate a repository, call an LLM, or fetch
runtime assets. Explanation generation belongs to the calling agent and the
eventual skill.

This document describes the intended architecture before implementation.
Concrete package names may move during the foundation plan, but the ownership
boundaries and invariants below are decisions.

## System shape

    repository ----> Git process adapter ----> history snapshot
                                                |
    explanations.json --------------------------+
                                                v
                                      graph layout model
                                                |
    embedded Svelte JS/CSS ---------------------+
                                                v
                                      HTML report renderer
                                                |
                                                v
                                     standalone report.html

In the browser:

    embedded report JSON -> Svelte application -> semantic history + SVG graph

## Major components

### CLI

The Go command validates user intent, resolves paths, coordinates generation,
reports warnings, and installs completed output atomically on Unix-like
systems. Its public behavior is
defined by [docs/cli-contract.md](docs/cli-contract.md).

### Git process adapter

The adapter invokes Git without a shell and converts machine-readable command
output into explicit domain types. Git remains the authority for ref selection,
ordering, repository discovery, object IDs, and metadata. The adapter never
parses the colored or ASCII graph presentation. See
[docs/git-history.md](docs/git-history.md).

### History and explanation model

The domain model represents repository identity, selection, commits, parents,
refs, people, timestamps, raw messages, and optional explanations. It contains
no DOM, SVG, or terminal concepts.

### Graph layout

The layout engine consumes the ordered commit DAG and emits logical row and
lane transitions. It owns deterministic topology and truncation markers, while
the browser owns responsive pixel coordinates. See
[docs/graph-layout.md](docs/graph-layout.md).

### Report renderer

The renderer combines versioned report JSON, the HTML shell, compiled Svelte
JavaScript, compiled CSS, and a restrictive content policy. It escapes dynamic
content and emits one file that runs through file URLs. See
[docs/report-format.md](docs/report-format.md).

### Svelte report application

The client application renders semantic commit controls beside an SVG graph,
manages selection and explanation/raw state, and adapts the details view for
desktop and mobile. It performs no Git or network operations. Its contract and
visual world are defined in [docs/report-ui.md](docs/report-ui.md).

### Agent skill

The skill is an orchestration layer. It determines the visible commits,
inspects evidence, writes optional explanations, invokes the installed CLI,
and returns the report. It does not duplicate Git parsing, graph layout, or
HTML generation. See
[docs/distribution-and-skill.md](docs/distribution-and-skill.md).

## Generation flow

1. The CLI validates flags and resolves the repository through Git.
2. The Git adapter selects commits using explicit all-refs or current-branch
   semantics and collects refs and metadata.
3. The explanation reader validates the optional JSON map and attaches entries
   only by full object ID.
4. The graph engine assigns logical lanes and marks parents outside the visible
   slice.
5. The renderer serializes a versioned report model and inlines compiled UI
   assets.
6. The writer creates a temporary sibling file and installs the final output
   without following a symlink. The same-directory rename is atomic on
   Unix-like systems; other platforms use their host rename semantics.

## Viewing flow

1. The browser loads the file without making network requests.
2. The bundled application reads and validates the embedded schema version.
3. Svelte mounts into the report root and renders ordinary HTML controls plus
   an SVG topology layer.
4. Selection is reflected in the URL fragment so browser back and forward work.
5. The details view defaults to the explanation and can reveal the raw message.

## Planned code map

The foundation plan should establish these starting points:

- cmd/gitlog-html: executable entry point and CLI exit behavior.
- internal/gitexec: Git process boundary and parsers.
- internal/history: domain types and explanation attachment.
- internal/graph: logical lane assignment.
- internal/report: schema conversion, asset embedding, security policy, and
  complete-write-before-install output on every platform, with atomic
  same-directory rename on Unix-like systems.
- web: Svelte source, TypeScript report contract, UI tests, and visual fixtures.
- internal/report/assets: committed deterministic frontend build output.
- skill/gitlog-html: thin skill instructions and references.

Nested architecture documents are not justified before these subsystems exist.
Add one only when a subtree develops an independent lifecycle or contributor
entry point that cannot be explained here concisely.

## Invariants

- Git is invoked as an executable with an argument vector; no repository value
  is interpolated into a shell command.
- Git selects and orders commits; application code does not approximate
  revision semantics.
- ASCII graph output is never parsed.
- A commit object ID is opaque and variable-length; code does not assume SHA-1.
- The graph model is deterministic for the same ordered commit DAG.
- Explanations are optional plain text and never replace raw Git evidence.
- The report schema is versioned before it crosses from Go to TypeScript.
- Dynamic repository content is serialized as data and rendered as text.
- The output contains no external runtime dependency or network access.
- Go owns data and integration; Claude Code owns frontend/UI source and design
  under the delegation rules in [AGENTS.md](AGENTS.md).
- Generated frontend assets are reproducible and never hand-edited.

## Critical dependencies

- Git is a required runtime dependency of the generator and the semantic source
  of truth.
- Go builds and distributes the CLI as a native executable.
- Svelte and Vite are build-time dependencies only; their compiled output is
  embedded in the Go executable.
- A modern browser executes the generated report. Mobile browsers view the
  report but never need to run the generator.
