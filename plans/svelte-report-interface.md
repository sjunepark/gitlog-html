# Build the responsive Svelte report interface

## Outcome

Claude Code delivers the complete Svelte 5 report interface, compiled assets,
and frontend validation for desktop and mobile using the approved report schema
and logical graph layout, while Go and Git/domain boundaries remain unchanged.

## Current state

Complete. The Claude-owned Svelte 5 interface consumes schema v1, renders the
Go-owned graph layout, and covers the approved desktop, mobile, accessibility,
offline, hostile-content, empty, detached, shallow, truncated, dense, and
failure states. The deterministic build emits the two committed frontend
assets, and repository CI exercises checks, unit tests, and file-URL browser
flows.

## Next action

None. The next roadmap result is standalone report and CLI assembly.

## Ownership

Claude Code owns:

- web/**;
- Svelte and TypeScript component structure;
- HTML semantics inside the mounted application;
- CSS, SVG rendering, responsive behavior, accessibility, and interaction;
- frontend tests and visual fixtures;
- the generated frontend asset output produced by its build.

Codex owns:

- PRODUCT.md and the report data contract;
- Go, Git, domain, and graph packages;
- final HTML assembly, JSON escaping, CSP, and atomic output;
- integration inspection and acceptance;
- routing every UI revision back to the same Claude session.

Claude must not edit Go or change the report schema. If the schema is
insufficient, it reports the smallest required contract change and waits for
Codex to resolve it.

## Delegation procedure

- Invoke the current $delegate-ui-to-claude workflow.
- Confirm the claude executable and its version.
- Check for Codex-facing Impeccable artifacts and stop for required cleanup
  authorization if any exist.
- Install or refresh Impeccable only for Claude at repository scope.
- Use a one-shot implementation handoff because the product and visual
  decisions are established in the approved documents.
- Begin the prompt with the workflow-required Impeccable command.
- Include editable paths, non-goals, contract fixture, responsive states,
  accessibility criteria, file-URL requirement, validation commands, and
  unrelated-path protections.
- Require browser iteration on representative desktop and mobile fixtures.
- Capture the Claude session ID and use the same session for all revisions.

## Scope

- Create a Svelte 5 and TypeScript project using Vite without SvelteKit.
- Build one IIFE JavaScript bundle and one CSS asset with no dynamic chunks,
  source maps, external dependencies, or runtime requests.
- Mount the app through Svelte's client mount API.
- Parse and guard schema version 1 and show an intentional startup failure.
- Implement header, semantic history list, SVG graph, commit rows, ref labels,
  details, explanation/raw behavior, empty state, and failure state.
- Implement URL-fragment selection and browser back/forward behavior.
- Implement desktop split details and mobile dialog or sheet with focus
  restoration.
- Implement light, dark, reduced-motion, keyboard-focus, long-content, dense
  lane, detached, unborn, truncated, and no-explanation states.
- Add TypeScript/Svelte checks, component behavior tests, browser tests, and
  stable desktop/mobile screenshots.
- Produce deterministic assets in the agreed Go embed directory.

## Completion conditions

- Every interaction and state in docs/report-ui.md is implemented.
- No Git or lane assignment logic exists in TypeScript.
- The UI makes no network request and works when loaded from a file URL.
- Commit text and explanations are rendered without raw HTML.
- Keyboard, focus, touch, zoom, light/dark, and reduced-motion requirements
  pass.
- A non-developer can identify and open the explanation; raw evidence remains
  accessible.
- Desktop and mobile visual review finds no incomplete controls or accidental
  horizontal page overflow.
- Claude reports changed files, design decisions, validation, and limitations.
- Codex independently validates contract usage and routes all UI findings back
  to Claude until accepted.

## Validation

Use the implemented equivalents of:

    npm ci
    npm run check
    npm test
    npm run build
    npm run test:e2e

Verify generated asset determinism and inspect desktop/mobile screenshots. Run
the required code-review workflow after Claude and integration checks pass.

Current evidence: a clean npm install and audit report no known
vulnerabilities; Svelte and TypeScript checks pass without diagnostics; 190
component tests and 103 Chromium desktop/mobile file-URL tests pass; axe
reports no violations in the representative states; generated assets are
byte-reproducible and current; and visual review covers principal light, dark,
focus, failure, dense-lane, hostile-content, long-content, and mobile-dialog
states. The full Go suite, race detector, vet, workflow syntax check, and diff
checks pass. Required implementation and PR review findings were resolved,
including breakpoint-stable selection, lossless untrusted text, visible and
inert bidirectional controls, two-level startup failure rendering, strict
schema guards, no-network enforcement, edge-boundary meaning when a parent
object appears elsewhere, and stable touch targets. The final independent
whole-diff review found no remaining material correctness, security,
accessibility, asset-synchronization, or complexity issue.

## Out of scope

- SvelteKit, SSR, hosting, or routing libraries.
- Search, filtering, diff display, Markdown, and external links.
- Git/domain changes made by Claude.
