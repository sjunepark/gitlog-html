# Implement deterministic commit graph layout

## Outcome

Every selected commit DAG, including merges, disconnected histories, and
truncated parents, is converted into a deterministic logical lane model that
the Svelte UI can draw responsively without knowing Git traversal rules.

## Current state

The lane vocabulary, algorithm, output expectations, and invariants are defined
in docs/graph-layout.md. No layout implementation exists. This plan assumes the
history extractor can provide ordered commits and parent visibility.

## Next action

Define the minimal immutable input and output types in the graph package and
write failing example tests for linear and branch-and-merge histories.

## Scope

- Implement active-lane state and deterministic lane reuse.
- Preserve first-parent continuity when possible.
- Represent second and later parents in stable order.
- Converge a parent already active in another lane without duplicating it.
- Carry unrelated lane continuations across intervening rows.
- Represent true roots, maximum-count boundaries, and shallow boundaries
  distinctly.
- Support disconnected histories and commits with more than two parents.
- Emit pixel-independent rows, node lanes, transitions, relationship kinds,
  and boundary metadata.
- Add human-readable small snapshots for important examples.
- Add property-based or generated-DAG tests for structural invariants without
  introducing a production dependency solely for tests unless it materially
  improves failure shrinking and diagnosis.
- Confirm layout work grows with commits and active transitions rather than
  with screen dimensions or message content.

## Required examples

- single linear lane;
- a branch that later merges;
- a merge parent already active in another lane;
- multiple simultaneous ref tips;
- disconnected orphan histories;
- multiple-parent merge;
- duplicate ancestry converging on one commit;
- visible true root;
- parent below the maximum-count boundary;
- shallow boundary.

## Completion conditions

- Every visible parent relationship appears exactly once.
- Every commit has exactly one row and node lane.
- No active object ID is duplicated after convergence.
- All lane references are valid and parent edges move toward a later row or
  boundary.
- The same input produces byte-equivalent serialized layout.
- The browser fixture can render from layout data without recomputing lanes.
- Real Git fixture relation sets match the graph relation sets.
- Dense histories do not panic or silently discard an edge.

## Validation

    go test ./...
    go vet ./...

Review failing property-test output for diagnosability and keep example
snapshots small enough to understand manually. Run the required code-review
workflow before completing this plan.

## Out of scope

- SVG paths, lane color, pixels, animation, or breakpoints.
- Selecting or ordering commits.
- Changing the report schema without coordinating the contract fixture.

