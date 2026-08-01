# Report UI and Interaction

## Design intent

The report should feel like an editorial timeline of how work developed, not a
developer dashboard transplanted into a browser. Typography, alignment,
spacing, and the graph carry hierarchy. Containers and rounded panels are used
only where they clarify the selected detail region.

The initial view answers three questions:

1. Which repository and slice am I seeing?
2. How did lines of work diverge and come together?
3. What changed at each point?

Git mechanics remain available without becoming the visual headline.

## Visual language

- Use native system sans-serif text and a system monospace stack for object IDs
  and raw messages. Do not load fonts.
- Use a neutral page background, high-contrast text, quiet separators, and a
  restrained set of lane colors.
- Give explanations more typographic weight than hashes and ref mechanics.
- Avoid a wall of cards, nested panels, decorative gradients, novelty
  illustrations, and excessive rounded corners.
- Support light and dark color schemes from the browser preference.
- Preserve topology without relying on color alone: position, continuous
  strokes, nodes, boundary treatments, and labels all carry meaning.

## Desktop layout

Desktop uses a history-and-details split:

    repository title, scope, generated time
    -----------------------------------------------------------
    graph + commit timeline             selected commit details
    graph + commit timeline             explanation / raw toggle
    graph + commit timeline             identity, time, parents

The timeline remains the dominant region. The details pane is sticky within the
viewport, has an independent natural scroll only when needed, and does not hide
the graph.

Each commit row aligns:

- the SVG node and lane transitions;
- a readable local date and time;
- the explanation summary or subject fallback;
- compact ref labels;
- a subtle abbreviated object ID when space permits.

The complete explanation belongs in details. A long explanation must not make
its timeline row disproportionately tall; the row uses a concise text clamp
with a clear selected state.

## Mobile layout

Mobile is a single-column history with a compact graph gutter. Date and summary
stay readable before optional metadata. Ref labels wrap or collapse without
forcing the main text off-screen.

Selecting a commit opens an accessible full-height dialog or bottom sheet. It
has:

- a visible title and close control;
- explanation-first content;
- the raw-message toggle;
- metadata below the main text;
- safe-area padding and touch targets;
- focus containment and focus restoration.

Closing details returns the reader to the same history position. Browser back
also closes or changes the selected commit through URL-fragment state.

Lane pitch becomes narrower on small screens. When simultaneous lanes exceed
the available graph gutter, the graph region can pan horizontally while the
commit text retains a usable minimum width. The implementation must test a
dense fixture rather than assuming the default ten-commit report is narrow.

## Report header

Show:

- repository display name as the page heading;
- branch name, detached HEAD, or unborn state;
- scope in human language, such as Latest 10 commits across all refs;
- generated date and time;
- a concise limitation notice when history is truncated or shallow.

Do not expose a toolbar of inactive future controls. Search, filters, export,
and diff controls are absent in the first release.

## Commit selection

Every commit row is a native button or contains one primary native button. It
supports pointer, touch, Enter, and Space. Selection:

- updates the details view;
- visually emphasizes the node, row, and directly related parent edges;
- writes the full object ID to the URL fragment;
- preserves browser back and forward behavior;
- can initialize from a valid fragment when the file opens.

An invalid fragment is ignored without an error banner. Copying the file with a
fragment gives another reader the same initial selection.

## Explanation and raw message

When an explanation exists, details open on Explanation. A two-state segmented
control or tabs switch between Explanation and Raw commit message.

When no explanation exists:

- the commit subject is the primary row label;
- details show the raw commit message without an unnecessary disabled toggle;
- no placeholder claims that an agent analyzed the commit.

Plain-text explanations preserve paragraphs and line breaks. They are never
rendered as Markdown or HTML.

Raw messages use a selectable monospace presentation with preserved whitespace.
They are not syntax-highlighted and are not visually presented as executable
code.

## Metadata

Details show information in this order:

1. explanation or raw message;
2. committed date and committer;
3. author date and author when materially different;
4. refs;
5. full object ID;
6. ordered parent IDs.

Technical metadata uses labels understandable without Git expertise. Parent
links select a visible parent when present; parents outside the slice are
identified as outside the displayed history and are not broken controls.

## Graph presentation

Render paths and nodes in SVG aligned to semantic HTML rows. The SVG is not the
only interaction surface and can be hidden from assistive technology because
the commit controls and details expose equivalent content.

Use smooth but restrained curves for lane changes. First-parent continuity is
visually direct; secondary parent edges curve into or out of the merge node.
True roots terminate cleanly. Truncated and shallow boundaries fade or use a
continuation glyph.

Selection highlighting may animate briefly, but respect reduced-motion
preferences and never animate the initial graph construction in a distracting
way.

## States

Design and verify:

- ordinary history with and without explanations;
- selected and unselected commits;
- merge commit with multiple parents;
- all refs with several labels;
- truncated and shallow boundaries;
- empty repository;
- detached and unborn HEAD;
- long explanation and raw message;
- dense lanes on narrow mobile;
- unsupported schema or startup failure;
- light, dark, keyboard-focus, and reduced-motion modes.

## Accessibility

- Use one page heading and a labeled history region.
- Expose commits as an ordered semantic list.
- Ensure every interaction has a native control and visible focus.
- Announce the selected commit and details-region update without excessive live
  narration.
- Maintain text and non-text contrast in both color schemes.
- Do not communicate ref kind, selection, or boundary state with color alone.
- Keep touch targets usable and avoid hover-only disclosure.
- Restore focus when mobile details close.
- Test at increased text size and browser zoom without clipping controls.

## Svelte component boundaries

Expected components include:

- App: startup, schema guard, and selection state;
- ReportHeader: repository and scope context;
- HistoryView: ordered semantic list and aligned graph;
- CommitGraph: SVG presentation from logical layout;
- CommitRow: summary, refs, selection, and accessible label;
- CommitDetails: explanation/raw state and metadata;
- RefLabel: consistent ref-kind presentation;
- EmptyHistory and ReportFailure: intentional non-happy states.

Components may be reorganized when the resulting interface is simpler, but Git
semantics and lane assignment must not move into Svelte.

## Claude Code delegation contract

Claude Code owns frontend and UI design and implementation. The future
implementation agent must use the current $delegate-ui-to-claude workflow rather
than implementing web source itself.

The handoff must:

- begin with the workflow-required Impeccable invocation;
- identify web/** and the generated UI assets as Claude-owned;
- prohibit changes to Go, Git, graph, schema, and planning files;
- include PRODUCT.md, this document, report-format.md, and a finalized schema
  fixture;
- state that this document establishes the approved visual world, so the task
  is implementation and refinement rather than open-ended rebranding;
- require representative desktop and mobile browser iteration;
- require keyboard and accessibility validation;
- require a final list of changed files, design decisions, validation, and
  limitations;
- ask Claude to report any required contract change for Codex to resolve.

Before the handoff, Codex follows that current workflow to install or refresh
Claude-only, repository-scoped Impeccable and verify no Codex-facing
Impeccable artifact exists. Codex validates integration and sends UI findings
back to the same Claude session instead of editing Claude-owned source.

## Visual acceptance

The UI is accepted when a non-developer can identify the current story and open
an explanation without instruction, while a developer can still reach exact
Git evidence. Desktop and mobile screenshots must show clear hierarchy,
truthful merge topology, readable text, complete controls, and no horizontal
page overflow in representative fixtures.
