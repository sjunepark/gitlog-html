// Package report owns the versioned browser wire contract and standalone
// report assembly boundary.
package report

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/sjunepark/gitlog-html/internal/graph"
	"github.com/sjunepark/gitlog-html/internal/history"
)

const SchemaVersion = 1

type Generator struct {
	Name    string `json:"name"`
	Version string `json:"version,omitempty"`
}

type HeadState struct {
	Kind   string  `json:"kind"`
	Branch string  `json:"branch,omitempty"`
	OID    *string `json:"oid,omitempty"`
}

type Repository struct {
	Name string    `json:"name"`
	Head HeadState `json:"head"`
}

type Selection struct {
	Scope         string `json:"scope"`
	MaximumCount  int    `json:"maximumCount"`
	IncludedCount int    `json:"includedCount"`
	Truncated     bool   `json:"truncated"`
}

type Person struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	When  string `json:"when"`
}

type Parent struct {
	OID        string `json:"oid"`
	Visibility string `json:"visibility"`
}

type Ref struct {
	FullName    string `json:"fullName"`
	DisplayName string `json:"displayName"`
	Kind        string `json:"kind"`
	IsHEAD      bool   `json:"isHead"`
}

type Commit struct {
	OID            string   `json:"oid"`
	AbbreviatedOID string   `json:"abbreviatedOid"`
	Parents        []Parent `json:"parents"`
	Author         Person   `json:"author"`
	Committer      Person   `json:"committer"`
	Subject        string   `json:"subject"`
	RawMessage     string   `json:"rawMessage"`
	Explanation    *string  `json:"explanation,omitempty"`
	Refs           []Ref    `json:"refs"`
}

type Warning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type LaneState struct {
	Lane        int     `json:"lane"`
	ExpectedOID *string `json:"expectedOid,omitempty"`
}

type Transition struct {
	FromLane    int     `json:"fromLane"`
	ToLane      int     `json:"toLane"`
	Kind        string  `json:"kind"`
	ParentOID   *string `json:"parentOid,omitempty"`
	ParentIndex *int    `json:"parentIndex,omitempty"`
	Boundary    *string `json:"boundary,omitempty"`
}

type GraphRow struct {
	CommitOID   string       `json:"commitOid"`
	NodeLane    int          `json:"nodeLane"`
	Incoming    []LaneState  `json:"incoming"`
	Outgoing    []LaneState  `json:"outgoing"`
	Transitions []Transition `json:"transitions"`
}

type Graph struct {
	LaneCount int        `json:"laneCount"`
	Rows      []GraphRow `json:"rows"`
}

type Document struct {
	SchemaVersion int        `json:"schemaVersion"`
	Generator     Generator  `json:"generator"`
	GeneratedAt   string     `json:"generatedAt"`
	Repository    Repository `json:"repository"`
	Selection     Selection  `json:"selection"`
	Commits       []Commit   `json:"commits"`
	Graph         Graph      `json:"graph"`
	Warnings      []Warning  `json:"warnings"`
}

// Decode rejects unknown fields so fixtures and browser consumers cannot
// silently drift from the Go-owned contract.
func Decode(reader io.Reader) (Document, error) {
	decoder := json.NewDecoder(reader)
	decoder.DisallowUnknownFields()
	var document Document
	if err := decoder.Decode(&document); err != nil {
		return Document{}, fmt.Errorf("decode report: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return Document{}, errors.New("decode report: multiple JSON values")
		}
		return Document{}, fmt.Errorf("decode report trailing data: %w", err)
	}
	if err := document.Validate(); err != nil {
		return Document{}, err
	}
	return document, nil
}

// NewDocument is the explicit conversion boundary from mutable domain and
// graph models to report schema v1.
func NewDocument(generator Generator, generatedAt time.Time, snapshot history.Snapshot, layout graph.Layout) (Document, error) {
	document := Document{
		SchemaVersion: SchemaVersion,
		Generator:     generator,
		GeneratedAt:   generatedAt.Format(time.RFC3339Nano),
		Repository: Repository{
			Name: snapshot.Repository.DisplayName,
			Head: headFromDomain(snapshot.Repository.Head),
		},
		Selection: Selection{
			Scope:         string(snapshot.Selection.Scope),
			MaximumCount:  snapshot.Selection.Maximum,
			IncludedCount: len(snapshot.Commits),
			Truncated:     snapshot.Selection.Truncated,
		},
		Commits:  make([]Commit, len(snapshot.Commits)),
		Graph:    graphFromDomain(layout),
		Warnings: make([]Warning, len(snapshot.Warnings)),
	}
	for index, commit := range snapshot.Commits {
		document.Commits[index] = commitFromDomain(commit)
	}
	for index, warning := range snapshot.Warnings {
		document.Warnings[index] = Warning{Code: string(warning.Code), Message: warning.Message}
	}
	if err := document.Validate(); err != nil {
		return Document{}, err
	}
	return document, nil
}

func (d Document) Validate() error {
	if d.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported report schema version %d", d.SchemaVersion)
	}
	if d.Generator.Name == "" {
		return errors.New("generator name is required")
	}
	if _, err := time.Parse(time.RFC3339Nano, d.GeneratedAt); err != nil {
		return fmt.Errorf("generation timestamp: %w", err)
	}
	if d.Repository.Name == "" {
		return errors.New("repository name is required")
	}
	if err := validateHead(d.Repository.Head); err != nil {
		return fmt.Errorf("repository HEAD: %w", err)
	}
	if _, err := history.ParseScope(d.Selection.Scope); err != nil {
		return fmt.Errorf("selection scope: %w", err)
	}
	if d.Selection.MaximumCount <= 0 {
		return errors.New("selection maximum count must be positive")
	}
	if d.Selection.IncludedCount != len(d.Commits) {
		return fmt.Errorf("selection included count %d does not match %d commits", d.Selection.IncludedCount, len(d.Commits))
	}
	if d.Selection.IncludedCount > d.Selection.MaximumCount {
		return fmt.Errorf("selection includes %d commits beyond maximum %d", d.Selection.IncludedCount, d.Selection.MaximumCount)
	}
	if len(d.Graph.Rows) != len(d.Commits) {
		return fmt.Errorf("graph has %d rows for %d commits", len(d.Graph.Rows), len(d.Commits))
	}
	if len(d.Commits) == 0 && d.Graph.LaneCount != 0 {
		return errors.New("empty graph must have zero lanes")
	}
	if len(d.Commits) > 0 && d.Graph.LaneCount <= 0 {
		return errors.New("non-empty graph must have at least one lane")
	}

	rowsByOID := make(map[string]int, len(d.Commits))
	for index := range d.Commits {
		if err := validateCommit(d.Commits[index]); err != nil {
			return fmt.Errorf("commit %d: %w", index, err)
		}
		if _, exists := rowsByOID[d.Commits[index].OID]; exists {
			return fmt.Errorf("commit %d duplicates object ID %q", index, d.Commits[index].OID)
		}
		rowsByOID[d.Commits[index].OID] = index
	}
	for index := range d.Commits {
		for parentIndex, parent := range d.Commits[index].Parents {
			row, visible := rowsByOID[parent.OID]
			switch parent.Visibility {
			case string(history.ParentVisible):
				if !visible || row <= index {
					return fmt.Errorf("commit %d parent %d is visible but not present at a later row", index, parentIndex)
				}
			default:
				if visible {
					return fmt.Errorf("commit %d parent %d is a boundary but appears at row %d", index, parentIndex, row)
				}
			}
		}
		if err := validateGraphRow(d.Graph.Rows[index], d.Commits[index], d.Graph.LaneCount); err != nil {
			return fmt.Errorf("graph row %d: %w", index, err)
		}
	}
	for index, warning := range d.Warnings {
		switch warning.Code {
		case string(history.WarningDescriptionOutsideSlice), string(history.WarningIncompleteHistory):
		default:
			return fmt.Errorf("warning %d has unsupported code %q", index, warning.Code)
		}
		if warning.Message == "" {
			return fmt.Errorf("warning %d has an empty message", index)
		}
	}
	return nil
}

func validateHead(head HeadState) error {
	domain := history.HeadState{Kind: history.HeadKind(head.Kind), Branch: head.Branch}
	if head.OID != nil {
		oid, err := history.ParseObjectID(*head.OID)
		if err != nil {
			return err
		}
		domain.OID = &oid
	}
	return domain.Validate()
}

func validateCommit(commit Commit) error {
	if _, err := history.ParseObjectID(commit.OID); err != nil {
		return err
	}
	if _, err := history.ParseObjectID(commit.AbbreviatedOID); err != nil {
		return fmt.Errorf("abbreviated object ID: %w", err)
	}
	if !strings.HasPrefix(commit.OID, commit.AbbreviatedOID) {
		return errors.New("abbreviated object ID is not a prefix of the full object ID")
	}
	if commit.Subject != history.Subject(commit.RawMessage) {
		return errors.New("subject does not match the first raw-message line")
	}
	if commit.Explanation != nil && strings.TrimSpace(*commit.Explanation) == "" {
		return errors.New("blank explanation must be absent")
	}
	people := []struct {
		label  string
		person Person
	}{{"author", commit.Author}, {"committer", commit.Committer}}
	for _, item := range people {
		if _, err := time.Parse(time.RFC3339Nano, item.person.When); err != nil {
			return fmt.Errorf("%s timestamp: %w", item.label, err)
		}
	}
	for index, parent := range commit.Parents {
		if _, err := history.ParseObjectID(parent.OID); err != nil {
			return fmt.Errorf("parent %d object ID: %w", index, err)
		}
		switch parent.Visibility {
		case string(history.ParentVisible), string(history.ParentMaximumBoundary), string(history.ParentShallowBoundary):
		default:
			return fmt.Errorf("parent %d has unsupported visibility %q", index, parent.Visibility)
		}
	}
	for index, ref := range commit.Refs {
		if ref.FullName == "" || ref.DisplayName == "" {
			return fmt.Errorf("ref %d requires full and display names", index)
		}
		switch ref.Kind {
		case string(history.RefLocalBranch), string(history.RefRemoteBranch), string(history.RefTag), string(history.RefOther):
		default:
			return fmt.Errorf("ref %d has unsupported kind %q", index, ref.Kind)
		}
	}
	return nil
}

func validateGraphRow(row GraphRow, commit Commit, laneCount int) error {
	if row.CommitOID != commit.OID {
		return errors.New("object ID does not match commit")
	}
	if err := validateLane(row.NodeLane, laneCount); err != nil {
		return fmt.Errorf("node lane: %w", err)
	}
	laneGroups := []struct {
		label  string
		states []LaneState
	}{{"incoming", row.Incoming}, {"outgoing", row.Outgoing}}
	for _, group := range laneGroups {
		for index, state := range group.states {
			if err := validateLane(state.Lane, laneCount); err != nil {
				return fmt.Errorf("%s lane %d: %w", group.label, index, err)
			}
			if state.ExpectedOID != nil {
				if _, err := history.ParseObjectID(*state.ExpectedOID); err != nil {
					return fmt.Errorf("%s lane %d object ID: %w", group.label, index, err)
				}
			}
		}
	}
	parentTransitions := make([]int, len(commit.Parents))
	for index, transition := range row.Transitions {
		if err := validateLane(transition.FromLane, laneCount); err != nil {
			return fmt.Errorf("transition %d from lane: %w", index, err)
		}
		if err := validateLane(transition.ToLane, laneCount); err != nil {
			return fmt.Errorf("transition %d to lane: %w", index, err)
		}
		switch transition.Kind {
		case string(graph.RelationshipFirstParent), string(graph.RelationshipMerge):
			if transition.ParentOID == nil || transition.ParentIndex == nil {
				return fmt.Errorf("transition %d parent relationship is incomplete", index)
			}
			if *transition.ParentIndex < 0 || *transition.ParentIndex >= len(commit.Parents) {
				return fmt.Errorf("transition %d parent index is out of range", index)
			}
			parent := commit.Parents[*transition.ParentIndex]
			if *transition.ParentOID != parent.OID {
				return fmt.Errorf("transition %d parent object ID does not match commit", index)
			}
			if *transition.ParentIndex == 0 && transition.Kind != string(graph.RelationshipFirstParent) {
				return fmt.Errorf("transition %d first parent has wrong relationship kind", index)
			}
			if *transition.ParentIndex > 0 && transition.Kind != string(graph.RelationshipMerge) {
				return fmt.Errorf("transition %d merge parent has wrong relationship kind", index)
			}
			if parent.Visibility == string(history.ParentVisible) && transition.Boundary != nil {
				return fmt.Errorf("transition %d visible parent has a boundary", index)
			}
			if parent.Visibility != string(history.ParentVisible) && (transition.Boundary == nil || *transition.Boundary != parent.Visibility) {
				return fmt.Errorf("transition %d boundary does not match parent visibility", index)
			}
			parentTransitions[*transition.ParentIndex]++
		case string(graph.RelationshipContinuation):
			if transition.ParentOID != nil || transition.ParentIndex != nil || transition.Boundary != nil {
				return fmt.Errorf("transition %d continuation contains parent metadata", index)
			}
		default:
			return fmt.Errorf("transition %d has unsupported kind %q", index, transition.Kind)
		}
	}
	for index, count := range parentTransitions {
		if count != 1 {
			return fmt.Errorf("parent %d appears in %d transitions", index, count)
		}
	}
	return nil
}

func validateLane(lane, laneCount int) error {
	if lane < 0 || lane >= laneCount {
		return fmt.Errorf("lane %d is outside [0,%d)", lane, laneCount)
	}
	return nil
}

func headFromDomain(head history.HeadState) HeadState {
	wire := HeadState{Kind: string(head.Kind), Branch: head.Branch}
	if head.OID != nil {
		value := string(*head.OID)
		wire.OID = &value
	}
	return wire
}

func commitFromDomain(commit history.Commit) Commit {
	wire := Commit{
		OID:            string(commit.OID),
		AbbreviatedOID: string(commit.AbbreviatedOID),
		Author:         personFromDomain(commit.Author),
		Committer:      personFromDomain(commit.Committer),
		Subject:        commit.Subject,
		RawMessage:     commit.RawMessage,
		Explanation:    commit.Explanation,
		Parents:        make([]Parent, len(commit.Parents)),
		Refs:           make([]Ref, len(commit.Refs)),
	}
	for index, parent := range commit.Parents {
		wire.Parents[index] = Parent{OID: string(parent.OID), Visibility: string(parent.Visibility)}
	}
	for index, ref := range commit.Refs {
		wire.Refs[index] = Ref{FullName: ref.FullName, DisplayName: ref.DisplayName, Kind: string(ref.Kind), IsHEAD: ref.IsHEAD}
	}
	return wire
}

func personFromDomain(person history.Person) Person {
	return Person{Name: person.Name, Email: person.Email, When: person.When.Format(time.RFC3339Nano)}
}

func graphFromDomain(layout graph.Layout) Graph {
	wire := Graph{LaneCount: layout.LaneCount, Rows: make([]GraphRow, len(layout.Rows))}
	for rowIndex, row := range layout.Rows {
		wireRow := GraphRow{
			CommitOID:   string(row.CommitOID),
			NodeLane:    row.NodeLane,
			Incoming:    laneStatesFromDomain(row.Incoming),
			Outgoing:    laneStatesFromDomain(row.Outgoing),
			Transitions: make([]Transition, len(row.Transitions)),
		}
		for transitionIndex, transition := range row.Transitions {
			wireTransition := Transition{
				FromLane:    transition.FromLane,
				ToLane:      transition.ToLane,
				Kind:        string(transition.Kind),
				ParentIndex: transition.ParentIndex,
			}
			if transition.ParentOID != nil {
				value := string(*transition.ParentOID)
				wireTransition.ParentOID = &value
			}
			if transition.Boundary != nil {
				value := string(*transition.Boundary)
				wireTransition.Boundary = &value
			}
			wireRow.Transitions[transitionIndex] = wireTransition
		}
		wire.Rows[rowIndex] = wireRow
	}
	return wire
}

func laneStatesFromDomain(states []graph.LaneState) []LaneState {
	wire := make([]LaneState, len(states))
	for index, state := range states {
		wire[index].Lane = state.Lane
		if state.ExpectedOID != nil {
			value := string(*state.ExpectedOID)
			wire[index].ExpectedOID = &value
		}
	}
	return wire
}
