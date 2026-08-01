# Commit Graph Layout

## Responsibility

The graph engine converts an ordered commit DAG into a deterministic logical
layout. It does not choose commits, draw pixels, format colors, or depend on a
browser.

Git provides the ordered commits and parent IDs. Go assigns rows, lanes, and
lane transitions. Svelte converts lane indexes into responsive SVG
coordinates.

## Terms

- Row: one visible commit in Git-selected order.
- Lane: a vertical logical track carrying an expected commit or continuing
  parent relationship.
- Node lane: the lane occupied by the row's commit.
- First-parent edge: the primary history continuation of a commit.
- Merge edge: an edge to a second or later parent.
- Continuation: a lane crossing a row whose commit is on another lane.
- Boundary: an edge known to continue beyond the visible slice.

The layout describes topology. Branch names decorate commits but do not define
lanes.

## Input

The engine receives:

- visible commits in topological display order;
- each commit's ordered parent IDs;
- parent visibility and boundary reason;
- no visual measurements.

The same input must always yield byte-equivalent layout data.

## Lane-state algorithm

Maintain an ordered active-lane list of expected commit IDs.

For every visible commit:

1. Locate its ID in the active lanes.
2. If it is not present, place it in the first reusable empty lane or append a
   lane. This starts a ref tip or disconnected component.
3. Record that index as the node lane and snapshot incoming continuations.
4. Remove the current expected ID from its lane.
5. Prefer to place the first parent in the node lane, preserving visual
   continuity when that parent is not already active elsewhere.
6. Insert each additional parent in stable parent order adjacent to the node
   lane, unless that parent already has an active lane.
7. When a parent is already active, emit a transition into that lane instead of
   duplicating it.
8. Reuse empty lanes only when doing so cannot change an already-recorded
   transition. Remove trailing empty lanes after the row.
9. Emit logical segments from incoming lanes through the node to outgoing
   lanes, including parent index and boundary status.

At the final visible row, continue active parents to a boundary marker. A true
root terminates at its node. A shallow or maximum-count boundary terminates
with a distinct continuation treatment.

## Output contract

The report graph contains:

- total lane count required by the visible slice;
- one graph row per commit;
- commit object ID and node lane;
- incoming and outgoing lane states;
- transition segments with from-lane, to-lane, relationship kind, optional
  parent object ID, and boundary reason.

Coordinates, stroke width, colors, curves, hit areas, and animation are client
concerns. The browser may change lane pitch at a breakpoint but must not
reassign lanes.

## Visual requirements

- First-parent continuity should be visually straighter than merge edges when
  topology permits.
- Every visible parent relation has exactly one traceable edge.
- An edge may cross another edge, but nodes cannot overlap.
- Disconnected histories remain distinct.
- Multi-parent commits remain truthful even if visually dense.
- Truncation uses a fade or boundary glyph rather than a root node.
- Color distinguishes simultaneous lanes but is never the only topology cue.

## Invariants

- Every visible commit occurs in exactly one row and one node lane.
- Every visible parent relationship is represented once.
- Every segment references a valid lane in its row transition.
- A parent edge moves only toward a later row or a lower boundary.
- An active commit ID occupies at most one lane after convergence.
- Parent order is stable and first-parent identity is preserved.
- Lane count is the maximum active width, not a fixed product limit.
- Layout does not depend on hash length, ref names, messages, screen size, or
  lane color.

## Verification strategy

Example-based tests cover common histories and store small textual lane
snapshots. Property tests generate valid DAGs and assert the invariants above.
Real-repository integration fixtures compare the relation set in the layout
with the parent set emitted by Git.

Required examples include linear, branch-and-merge, criss-cross-like ancestry,
octopus merge, disconnected roots, an already-active merge parent, and
truncated parents.

