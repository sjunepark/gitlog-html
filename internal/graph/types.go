// Package graph defines and computes a pixel-independent commit topology.
package graph

import "github.com/sjunepark/gitlog-html/internal/history"

type RelationshipKind string

const (
	RelationshipFirstParent  RelationshipKind = "first-parent"
	RelationshipMerge        RelationshipKind = "merge"
	RelationshipContinuation RelationshipKind = "continuation"
)

type LaneState struct {
	Lane        int
	ExpectedOID *history.ObjectID
}

type Transition struct {
	FromLane    int
	ToLane      int
	Kind        RelationshipKind
	ParentOID   *history.ObjectID
	ParentIndex *int
	Boundary    *history.ParentVisibility
}

type Row struct {
	CommitOID   history.ObjectID
	NodeLane    int
	Incoming    []LaneState
	Outgoing    []LaneState
	Transitions []Transition
}

type Layout struct {
	LaneCount int
	Rows      []Row
}
