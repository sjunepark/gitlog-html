package graph

import (
	"errors"
	"fmt"

	"github.com/sjunepark/gitlog-html/internal/history"
)

// MaximumLayoutComplexity bounds the cumulative serialized lane and edge
// material that one report can request. Ordinary long histories remain cheap,
// while adversarially wide histories cannot amplify bounded Git output into
// unbounded graph allocations.
const MaximumLayoutComplexity = 200_000

// ComplexityError reports a valid topology whose serialized lane and edge
// material would exceed the release safety budget.
type ComplexityError struct {
	Row   int
	Limit int
}

func (err *ComplexityError) Error() string {
	return fmt.Sprintf("layout row %d exceeds the %d-unit graph complexity limit", err.Row, err.Limit)
}

// InputError reports history that cannot form the promised topological layout.
type InputError struct {
	Row         int
	ParentIndex *int
	Err         error
}

func (err *InputError) Error() string {
	if err.ParentIndex != nil {
		return fmt.Sprintf("layout row %d parent %d: %v", err.Row, *err.ParentIndex, err.Err)
	}
	return fmt.Sprintf("layout row %d: %v", err.Row, err.Err)
}

func (err *InputError) Unwrap() error { return err.Err }

type laneSlot struct {
	expected      *history.ObjectID
	boundaryIndex *int
}

type pendingParent struct {
	index  int
	parent history.Parent
}

// Build converts commits in topological display order into deterministic,
// pixel-independent lane transitions.
func Build(commits []history.Commit) (Layout, error) {
	if err := validateInput(commits); err != nil {
		return Layout{}, err
	}

	active := []laneSlot{}
	rows := make([]Row, len(commits))
	laneCount := 0
	complexity := 0
	for rowIndex, commit := range commits {
		// Check a conservative per-row upper bound before materializing lane
		// snapshots. The bound includes both lane snapshots, continuations, and
		// parent edges, including a newly allocated lane for a disconnected tip.
		expected := 0
		for _, slot := range active {
			if slot.expected != nil {
				expected++
			}
		}
		growth := len(commit.Parents)
		if growth == 0 {
			growth = 1
		}
		for _, contribution := range []int{len(active), len(active), growth, expected, len(commit.Parents)} {
			if contribution > MaximumLayoutComplexity-complexity {
				return Layout{}, &ComplexityError{Row: rowIndex, Limit: MaximumLayoutComplexity}
			}
			complexity += contribution
		}
		incoming := laneStates(active)
		nodeLane := findExpectedLane(active, commit.OID)
		if nodeLane < 0 {
			nodeLane = firstEmptyLane(active)
			ensureLane(&active, nodeLane)
			active[nodeLane].expected = oidPointer(commit.OID)
		}

		// Consume the current node, then reserve parent slots in parent order.
		// Later-parent insertion may shift unrelated lanes, so transition lane
		// numbers are resolved only after every parent has been placed.
		active[nodeLane] = laneSlot{}
		activeOIDs := activeObjectIDs(active)
		pending := make([]pendingParent, len(commit.Parents))
		mergeInsertLane := nodeLane + 1
		for parentIndex, parent := range commit.Parents {
			pending[parentIndex] = pendingParent{index: parentIndex, parent: parent}
			if parent.Visibility == history.ParentVisible {
				if _, exists := activeOIDs[parent.OID]; exists {
					continue
				}
			}

			targetLane := nodeLane
			if parentIndex > 0 {
				targetLane = mergeInsertLane
				ensureInsertionLane(&active, targetLane)
				mergeInsertLane++
			} else {
				ensureLane(&active, targetLane)
			}
			if parent.Visibility == history.ParentVisible {
				active[targetLane].expected = oidPointer(parent.OID)
				activeOIDs[parent.OID] = struct{}{}
			} else {
				active[targetLane].boundaryIndex = intPointer(parentIndex)
			}
		}
		if len(active) > laneCount {
			laneCount = len(active)
		}

		expectedLanes, boundaryLanes := laneIndexes(active)
		transitions, err := resolveTransitions(rowIndex, incoming, nodeLane, commit, expectedLanes, boundaryLanes, pending)
		if err != nil {
			return Layout{}, err
		}
		for lane := range active {
			active[lane].boundaryIndex = nil
		}
		active = trimTrailingEmpty(active)
		rows[rowIndex] = Row{
			CommitOID:   commit.OID,
			NodeLane:    nodeLane,
			Incoming:    incoming,
			Outgoing:    laneStates(active),
			Transitions: transitions,
		}
	}
	if len(active) != 0 {
		return Layout{}, &InputError{Row: len(commits), Err: errors.New("visible parents remain active after the final row")}
	}
	return Layout{LaneCount: laneCount, Rows: rows}, nil
}

func validateInput(commits []history.Commit) error {
	rowsByOID := make(map[history.ObjectID]int, len(commits))
	for rowIndex, commit := range commits {
		if err := commit.OID.Validate(); err != nil {
			return &InputError{Row: rowIndex, Err: fmt.Errorf("commit object ID: %w", err)}
		}
		if _, exists := rowsByOID[commit.OID]; exists {
			return &InputError{Row: rowIndex, Err: fmt.Errorf("duplicate commit object ID %q", commit.OID)}
		}
		rowsByOID[commit.OID] = rowIndex
	}
	for rowIndex, commit := range commits {
		for parentIndex, parent := range commit.Parents {
			index := parentIndex
			if err := parent.OID.Validate(); err != nil {
				return &InputError{Row: rowIndex, ParentIndex: &index, Err: fmt.Errorf("object ID: %w", err)}
			}
			parentRow, visible := rowsByOID[parent.OID]
			switch parent.Visibility {
			case history.ParentVisible:
				if !visible {
					return &InputError{Row: rowIndex, ParentIndex: &index, Err: errors.New("visible parent is absent")}
				}
				if parentRow <= rowIndex {
					return &InputError{Row: rowIndex, ParentIndex: &index, Err: errors.New("visible parent is not at a later row")}
				}
			case history.ParentMaximumBoundary:
				if visible {
					return &InputError{Row: rowIndex, ParentIndex: &index, Err: errors.New("maximum-count boundary parent appears in the visible slice")}
				}
			case history.ParentShallowBoundary:
			default:
				return &InputError{Row: rowIndex, ParentIndex: &index, Err: fmt.Errorf("unsupported visibility %q", parent.Visibility)}
			}
		}
	}
	return nil
}

func resolveTransitions(rowIndex int, incoming []LaneState, nodeLane int, commit history.Commit, expectedLanes map[history.ObjectID]int, boundaryLanes map[int]int, parents []pendingParent) ([]Transition, error) {
	transitions := make([]Transition, 0, len(incoming)+len(parents))
	for _, state := range incoming {
		if state.ExpectedOID == nil {
			continue
		}
		if state.Lane == nodeLane && *state.ExpectedOID == commit.OID {
			continue
		}
		toLane, exists := expectedLanes[*state.ExpectedOID]
		if !exists {
			return nil, &InputError{Row: rowIndex, Err: fmt.Errorf("incoming object ID %q lost during lane transition", *state.ExpectedOID)}
		}
		transitions = append(transitions, Transition{FromLane: state.Lane, ToLane: toLane, Kind: RelationshipContinuation})
	}
	for _, pending := range parents {
		toLane, exists := expectedLanes[pending.parent.OID]
		if pending.parent.Visibility != history.ParentVisible {
			toLane, exists = boundaryLanes[pending.index]
		}
		if !exists {
			index := pending.index
			return nil, &InputError{Row: rowIndex, ParentIndex: &index, Err: errors.New("parent lane was not assigned")}
		}
		transitions = append(transitions, parentTransition(nodeLane, toLane, pending.index, pending.parent))
	}
	return transitions, nil
}

func parentTransition(fromLane, toLane, parentIndex int, parent history.Parent) Transition {
	kind := RelationshipMerge
	if parentIndex == 0 {
		kind = RelationshipFirstParent
	}
	transition := Transition{
		FromLane:    fromLane,
		ToLane:      toLane,
		Kind:        kind,
		ParentOID:   oidPointer(parent.OID),
		ParentIndex: intPointer(parentIndex),
	}
	if parent.Visibility != history.ParentVisible {
		visibility := parent.Visibility
		transition.Boundary = &visibility
	}
	return transition
}

func laneStates(active []laneSlot) []LaneState {
	states := make([]LaneState, len(active))
	expectedCount := 0
	for _, slot := range active {
		if slot.expected != nil {
			expectedCount++
		}
	}
	expected := make([]history.ObjectID, 0, expectedCount)
	for lane, slot := range active {
		states[lane] = LaneState{Lane: lane}
		if slot.expected != nil {
			expected = append(expected, *slot.expected)
			states[lane].ExpectedOID = &expected[len(expected)-1]
		}
	}
	return states
}

func findExpectedLane(active []laneSlot, oid history.ObjectID) int {
	for lane, slot := range active {
		if slot.expected != nil && *slot.expected == oid {
			return lane
		}
	}
	return -1
}

func activeObjectIDs(active []laneSlot) map[history.ObjectID]struct{} {
	oids := make(map[history.ObjectID]struct{}, len(active))
	for _, slot := range active {
		if slot.expected != nil {
			oids[*slot.expected] = struct{}{}
		}
	}
	return oids
}

func laneIndexes(active []laneSlot) (map[history.ObjectID]int, map[int]int) {
	expected := make(map[history.ObjectID]int, len(active))
	boundaries := make(map[int]int)
	for lane, slot := range active {
		if slot.expected != nil {
			expected[*slot.expected] = lane
		}
		if slot.boundaryIndex != nil {
			boundaries[*slot.boundaryIndex] = lane
		}
	}
	return expected, boundaries
}

func firstEmptyLane(active []laneSlot) int {
	for lane, slot := range active {
		if slot.expected == nil && slot.boundaryIndex == nil {
			return lane
		}
	}
	return len(active)
}

func ensureLane(active *[]laneSlot, lane int) {
	for len(*active) <= lane {
		*active = append(*active, laneSlot{})
	}
}

func ensureInsertionLane(active *[]laneSlot, lane int) {
	ensureLane(active, lane)
	if (*active)[lane].expected == nil && (*active)[lane].boundaryIndex == nil {
		return
	}
	*active = append(*active, laneSlot{})
	copy((*active)[lane+1:], (*active)[lane:len(*active)-1])
	(*active)[lane] = laneSlot{}
}

func trimTrailingEmpty(active []laneSlot) []laneSlot {
	for len(active) > 0 {
		last := active[len(active)-1]
		if last.expected != nil || last.boundaryIndex != nil {
			break
		}
		active = active[:len(active)-1]
	}
	return active
}

func oidPointer(oid history.ObjectID) *history.ObjectID {
	value := oid
	return &value
}

func intPointer(value int) *int {
	pointer := value
	return &pointer
}
