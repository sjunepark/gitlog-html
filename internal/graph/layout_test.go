package graph

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/sjunepark/gitlog-html/internal/history"
)

func TestBuildExamples(t *testing.T) {
	tests := []struct {
		name      string
		commits   []history.Commit
		laneCount int
		want      string
	}{
		{
			name: "linear lane and true root",
			commits: []history.Commit{
				commit("a", visible("b")),
				commit("b", visible("c")),
				commit("c"),
			},
			laneCount: 1,
			want: strings.TrimSpace(`
a@0 in=- out=0:b tx=first-parent:0>0:b#0
b@0 in=0:b out=0:c tx=first-parent:0>0:c#0
c@0 in=0:c out=- tx=-`),
		},
		{
			name: "branch merge and active-parent convergence",
			commits: []history.Commit{
				commit("a", visible("b"), visible("c")),
				commit("b", visible("d")),
				commit("c", visible("d")),
				commit("d"),
			},
			laneCount: 2,
			want: strings.TrimSpace(`
a@0 in=- out=0:b,1:c tx=first-parent:0>0:b#0,merge:0>1:c#1
b@0 in=0:b,1:c out=0:d,1:c tx=continuation:1>1,first-parent:0>0:d#0
c@1 in=0:d,1:c out=0:d tx=continuation:0>0,first-parent:1>0:d#0
d@0 in=0:d out=- tx=-`),
		},
		{
			name: "simultaneous tips converge",
			commits: []history.Commit{
				commit("a", visible("c")),
				commit("b", visible("c")),
				commit("c"),
			},
			laneCount: 2,
			want: strings.TrimSpace(`
a@0 in=- out=0:c tx=first-parent:0>0:c#0
b@1 in=0:c out=0:c tx=continuation:0>0,first-parent:1>0:c#0
c@0 in=0:c out=- tx=-`),
		},
		{
			name: "disconnected roots reuse lane",
			commits: []history.Commit{
				commit("a"),
				commit("b"),
			},
			laneCount: 1,
			want: strings.TrimSpace(`
a@0 in=- out=- tx=-
b@0 in=- out=- tx=-`),
		},
		{
			name: "octopus merge keeps parent order",
			commits: []history.Commit{
				commit("a", visible("b"), visible("c"), visible("d")),
				commit("b", visible("e")),
				commit("c", visible("e")),
				commit("d", visible("e")),
				commit("e"),
			},
			laneCount: 3,
			want: strings.TrimSpace(`
a@0 in=- out=0:b,1:c,2:d tx=first-parent:0>0:b#0,merge:0>1:c#1,merge:0>2:d#2
b@0 in=0:b,1:c,2:d out=0:e,1:c,2:d tx=continuation:1>1,continuation:2>2,first-parent:0>0:e#0
c@1 in=0:e,1:c,2:d out=0:e,1:_,2:d tx=continuation:0>0,continuation:2>2,first-parent:1>0:e#0
d@2 in=0:e,1:_,2:d out=0:e tx=continuation:0>0,first-parent:2>0:e#0
e@0 in=0:e out=- tx=-`),
		},
		{
			name: "maximum and shallow boundaries stay distinct",
			commits: []history.Commit{
				commit("a", maximum("b"), shallow("c")),
			},
			laneCount: 2,
			want:      "a@0 in=- out=- tx=first-parent:0>0:b#0[maximum-count-boundary],merge:0>1:c#1[shallow-boundary]",
		},
		{
			name: "merge insertion shifts unrelated continuations",
			commits: []history.Commit{
				commit("a", visible("b"), visible("e")),
				commit("b", visible("c"), visible("d")),
				commit("c"),
				commit("d"),
				commit("e"),
			},
			laneCount: 3,
			want: strings.TrimSpace(`
a@0 in=- out=0:b,1:e tx=first-parent:0>0:b#0,merge:0>1:e#1
b@0 in=0:b,1:e out=0:c,1:d,2:e tx=continuation:1>2,first-parent:0>0:c#0,merge:0>1:d#1
c@0 in=0:c,1:d,2:e out=0:_,1:d,2:e tx=continuation:1>1,continuation:2>2
d@1 in=0:_,1:d,2:e out=0:_,1:_,2:e tx=continuation:2>2
e@2 in=0:_,1:_,2:e out=- tx=-`),
		},
		{
			name: "duplicate ancestry converges without duplicate active IDs",
			commits: []history.Commit{
				commit("a", visible("c")),
				commit("b", visible("c")),
				commit("c", visible("d")),
				commit("d"),
			},
			laneCount: 2,
			want: strings.TrimSpace(`
a@0 in=- out=0:c tx=first-parent:0>0:c#0
b@1 in=0:c out=0:c tx=continuation:0>0,first-parent:1>0:c#0
c@0 in=0:c out=0:d tx=first-parent:0>0:d#0
d@0 in=0:d out=- tx=-`),
		},
		{
			name: "duplicate parent entries remain distinct relationships",
			commits: []history.Commit{
				commit("a", visible("b"), visible("b")),
				commit("b"),
			},
			laneCount: 1,
			want: strings.TrimSpace(`
a@0 in=- out=0:b tx=first-parent:0>0:b#0,merge:0>0:b#1
b@0 in=0:b out=- tx=-`),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			layout, err := Build(test.commits)
			if err != nil {
				t.Fatalf("Build(): %v", err)
			}
			if layout.LaneCount != test.laneCount {
				t.Fatalf("LaneCount = %d, want %d", layout.LaneCount, test.laneCount)
			}
			if got := snapshot(layout); got != test.want {
				t.Fatalf("layout snapshot:\n%s\nwant:\n%s", got, test.want)
			}
			assertLayoutInvariants(t, test.commits, layout)
		})
	}
}

func TestBuildGeneratedDAGsPreservesInvariantsAndDeterminism(t *testing.T) {
	for seed := uint64(1); seed <= 40; seed++ {
		commits := generatedDAG(seed, 80)
		first, err := Build(commits)
		if err != nil {
			t.Fatalf("seed %d: Build(): %v", seed, err)
		}
		second, err := Build(commits)
		if err != nil {
			t.Fatalf("seed %d: second Build(): %v", seed, err)
		}
		firstJSON, err := json.Marshal(first)
		if err != nil {
			t.Fatal(err)
		}
		secondJSON, err := json.Marshal(second)
		if err != nil {
			t.Fatal(err)
		}
		if string(firstJSON) != string(secondJSON) {
			t.Fatalf("seed %d: layouts are not byte-equivalent", seed)
		}
		assertLayoutInvariants(t, commits, first)
	}
}

func TestBuildWideOctopusDoesNotLoseEdges(t *testing.T) {
	commits := wideOctopus(256)
	layout, err := Build(commits)
	if err != nil {
		t.Fatalf("Build(): %v", err)
	}
	if layout.LaneCount != 256 || len(layout.Rows[0].Transitions) != 256 {
		t.Fatalf("wide layout has %d lanes and %d parent transitions", layout.LaneCount, len(layout.Rows[0].Transitions))
	}
	assertLayoutInvariants(t, commits, layout)
}

func TestBuildRejectsGraphBeyondComplexityBudget(t *testing.T) {
	_, err := Build(wideOctopus(512))
	var complexityErr *ComplexityError
	if !errors.As(err, &complexityErr) {
		t.Fatalf("Build() error = %T %v, want ComplexityError", err, err)
	}
	if complexityErr.Limit != MaximumLayoutComplexity || complexityErr.Row <= 0 {
		t.Fatalf("ComplexityError = %#v", complexityErr)
	}
}

func TestBuildAcceptsMaximumLinearSelection(t *testing.T) {
	commits := make([]history.Commit, history.MaximumCommitCount)
	for index := range commits {
		oid := fmt.Sprintf("%x", index)
		parent := fmt.Sprintf("%x", index+1)
		commits[index] = commit(oid, visible(parent))
	}
	commits[len(commits)-1].Parents[0].Visibility = history.ParentMaximumBoundary

	layout, err := Build(commits)
	if err != nil {
		t.Fatalf("Build(maximum linear selection): %v", err)
	}
	if len(layout.Rows) != history.MaximumCommitCount || layout.LaneCount != 1 {
		t.Fatalf("layout has %d rows and %d lanes", len(layout.Rows), layout.LaneCount)
	}
}

func BenchmarkBuildWideOctopus(b *testing.B) {
	commits := wideOctopus(256)
	b.ReportAllocs()
	b.ResetTimer()
	for range b.N {
		if _, err := Build(commits); err != nil {
			b.Fatal(err)
		}
	}
}

func TestBuildRejectsInvalidTopology(t *testing.T) {
	tests := []struct {
		name    string
		commits []history.Commit
	}{
		{name: "invalid commit ID", commits: []history.Commit{commit("not-an-id")}},
		{name: "duplicate commit", commits: []history.Commit{commit("a"), commit("a")}},
		{name: "visible parent absent", commits: []history.Commit{commit("a", visible("b"))}},
		{name: "visible parent earlier", commits: []history.Commit{commit("a"), commit("b", visible("a"))}},
		{name: "maximum boundary parent visible", commits: []history.Commit{commit("a", maximum("b")), commit("b")}},
		{name: "unknown visibility", commits: []history.Commit{commit("a", history.Parent{OID: "b", Visibility: "unknown"})}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := Build(test.commits)
			var inputErr *InputError
			if !errors.As(err, &inputErr) {
				t.Fatalf("Build() error = %T %v, want InputError", err, err)
			}
		})
	}
}

func TestBuildKeepsVisibleShallowTargetDisconnected(t *testing.T) {
	layout, err := Build([]history.Commit{commit("a", shallow("b")), commit("b")})
	if err != nil {
		t.Fatalf("Build(): %v", err)
	}
	if got, want := snapshot(layout), "a@0 in=- out=- tx=first-parent:0>0:b#0[shallow-boundary]\nb@0 in=- out=- tx=-"; got != want {
		t.Fatalf("layout:\n%s\nwant:\n%s", got, want)
	}
}

func assertLayoutInvariants(t *testing.T, commits []history.Commit, layout Layout) {
	t.Helper()
	if len(layout.Rows) != len(commits) {
		t.Fatalf("rows = %d, commits = %d", len(layout.Rows), len(commits))
	}
	rowsByOID := make(map[history.ObjectID]int, len(commits))
	for index, commit := range commits {
		rowsByOID[commit.OID] = index
	}
	for rowIndex, row := range layout.Rows {
		commit := commits[rowIndex]
		if row.CommitOID != commit.OID {
			t.Fatalf("row %d commit = %s, want %s", rowIndex, row.CommitOID, commit.OID)
		}
		if row.NodeLane < 0 || row.NodeLane >= layout.LaneCount {
			t.Fatalf("row %d node lane %d outside %d lanes", rowIndex, row.NodeLane, layout.LaneCount)
		}
		if rowIndex > 0 && !reflect.DeepEqual(layout.Rows[rowIndex-1].Outgoing, row.Incoming) {
			t.Fatalf("row %d incoming does not equal prior outgoing", rowIndex)
		}
		for label, states := range map[string][]LaneState{"incoming": row.Incoming, "outgoing": row.Outgoing} {
			lanes := map[int]struct{}{}
			oids := map[history.ObjectID]struct{}{}
			for stateIndex, state := range states {
				if state.Lane != stateIndex || state.Lane < 0 || state.Lane >= layout.LaneCount {
					t.Fatalf("row %d %s state = %#v", rowIndex, label, state)
				}
				if _, duplicate := lanes[state.Lane]; duplicate {
					t.Fatalf("row %d %s duplicates lane %d", rowIndex, label, state.Lane)
				}
				if state.ExpectedOID != nil {
					if _, duplicate := oids[*state.ExpectedOID]; duplicate {
						t.Fatalf("row %d %s duplicates object ID %s", rowIndex, label, *state.ExpectedOID)
					}
					oids[*state.ExpectedOID] = struct{}{}
				}
				lanes[state.Lane] = struct{}{}
			}
			if len(states) > 0 && states[len(states)-1].ExpectedOID == nil {
				t.Fatalf("row %d %s has a trailing empty lane", rowIndex, label)
			}
		}

		parentCounts := make([]int, len(commit.Parents))
		for _, transition := range row.Transitions {
			if transition.FromLane < 0 || transition.FromLane >= layout.LaneCount || transition.ToLane < 0 || transition.ToLane >= layout.LaneCount {
				t.Fatalf("row %d transition has invalid lane: %#v", rowIndex, transition)
			}
			if transition.Kind == RelationshipContinuation {
				if transition.ParentOID != nil || transition.ParentIndex != nil || transition.Boundary != nil {
					t.Fatalf("row %d continuation has parent metadata: %#v", rowIndex, transition)
				}
				continue
			}
			if transition.ParentOID == nil || transition.ParentIndex == nil || *transition.ParentIndex < 0 || *transition.ParentIndex >= len(commit.Parents) {
				t.Fatalf("row %d malformed parent transition: %#v", rowIndex, transition)
			}
			parentIndex := *transition.ParentIndex
			parent := commit.Parents[parentIndex]
			if *transition.ParentOID != parent.OID {
				t.Fatalf("row %d parent transition OID = %s, want %s", rowIndex, *transition.ParentOID, parent.OID)
			}
			if parentIndex == 0 && transition.Kind != RelationshipFirstParent || parentIndex > 0 && transition.Kind != RelationshipMerge {
				t.Fatalf("row %d parent transition kind = %s at index %d", rowIndex, transition.Kind, parentIndex)
			}
			if parent.Visibility == history.ParentVisible {
				if transition.Boundary != nil || rowsByOID[parent.OID] <= rowIndex {
					t.Fatalf("row %d visible parent transition = %#v", rowIndex, transition)
				}
			} else if transition.Boundary == nil || *transition.Boundary != parent.Visibility {
				t.Fatalf("row %d boundary transition = %#v", rowIndex, transition)
			}
			parentCounts[parentIndex]++
		}
		for parentIndex, count := range parentCounts {
			if count != 1 {
				t.Fatalf("row %d parent %d appears in %d transitions", rowIndex, parentIndex, count)
			}
		}
	}
}

func generatedDAG(seed uint64, count int) []history.Commit {
	next := func() uint64 {
		seed = seed*6364136223846793005 + 1442695040888963407
		return seed
	}
	commits := make([]history.Commit, count)
	for row := count - 1; row >= 0; row-- {
		commits[row] = commit(fmt.Sprintf("%x", row+1))
		available := count - row - 1
		parentCount := int(next() % 4)
		seen := map[int]struct{}{}
		for len(seen) < parentCount && len(seen) < available {
			parentRow := row + 1 + int(next()%uint64(available))
			if _, exists := seen[parentRow]; exists {
				continue
			}
			seen[parentRow] = struct{}{}
			commits[row].Parents = append(commits[row].Parents, visible(string(commits[parentRow].OID)))
		}
		if next()%9 == 0 {
			commits[row].Parents = append(commits[row].Parents, maximum(fmt.Sprintf("f%x", row+count+1)))
		}
		if next()%17 == 0 {
			commits[row].Parents = append(commits[row].Parents, shallow(fmt.Sprintf("e%x", row+count+1)))
		}
	}
	return commits
}

func wideOctopus(width int) []history.Commit {
	commits := make([]history.Commit, width+1)
	parents := make([]history.Parent, width)
	for index := range width {
		oid := fmt.Sprintf("%x", index+2)
		parents[index] = visible(oid)
		commits[index+1] = commit(oid)
	}
	commits[0] = commit("1", parents...)
	return commits
}

func snapshot(layout Layout) string {
	lines := make([]string, len(layout.Rows))
	for rowIndex, row := range layout.Rows {
		transitions := make([]string, len(row.Transitions))
		for index, transition := range row.Transitions {
			text := fmt.Sprintf("%s:%d>%d", transition.Kind, transition.FromLane, transition.ToLane)
			if transition.ParentOID != nil {
				text += ":" + string(*transition.ParentOID) + fmt.Sprintf("#%d", *transition.ParentIndex)
			}
			if transition.Boundary != nil {
				text += "[" + string(*transition.Boundary) + "]"
			}
			transitions[index] = text
		}
		lines[rowIndex] = fmt.Sprintf("%s@%d in=%s out=%s tx=%s", row.CommitOID, row.NodeLane, statesText(row.Incoming), statesText(row.Outgoing), listText(transitions))
	}
	return strings.Join(lines, "\n")
}

func statesText(states []LaneState) string {
	values := make([]string, len(states))
	for index, state := range states {
		if state.ExpectedOID == nil {
			values[index] = fmt.Sprintf("%d:_", state.Lane)
		} else {
			values[index] = fmt.Sprintf("%d:%s", state.Lane, *state.ExpectedOID)
		}
	}
	return listText(values)
}

func listText(values []string) string {
	if len(values) == 0 {
		return "-"
	}
	return strings.Join(values, ",")
}

func commit(oid string, parents ...history.Parent) history.Commit {
	return history.Commit{OID: history.ObjectID(oid), Parents: parents}
}

func visible(oid string) history.Parent {
	return history.Parent{OID: history.ObjectID(oid), Visibility: history.ParentVisible}
}

func maximum(oid string) history.Parent {
	return history.Parent{OID: history.ObjectID(oid), Visibility: history.ParentMaximumBoundary}
}

func shallow(oid string) history.Parent {
	return history.Parent{OID: history.ObjectID(oid), Visibility: history.ParentShallowBoundary}
}
