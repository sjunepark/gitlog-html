package report

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/sjunepark/gitlog-html/internal/graph"
	"github.com/sjunepark/gitlog-html/internal/history"
)

func TestVersionOneFixture(t *testing.T) {
	contents, err := os.ReadFile("../../testdata/report-v1.json")
	if err != nil {
		t.Fatal(err)
	}

	document, err := Decode(bytes.NewReader(contents))
	if err != nil {
		t.Fatalf("decode fixture: %v", err)
	}

	if got := document.Commits[0].RawMessage; !strings.Contains(got, "</script>") || !strings.Contains(got, "안녕하세요") {
		t.Fatalf("fixture lost hostile-looking or non-ASCII text: %q", got)
	}

	encoded, err := json.Marshal(document)
	if err != nil {
		t.Fatalf("encode fixture: %v", err)
	}
	if strings.Contains(string(encoded), "</script>") {
		t.Fatal("default report encoding emitted an unescaped closing script sequence")
	}
	if !strings.Contains(string(encoded), `\u003c/script\u003e`) {
		t.Fatal("encoded report does not preserve HTML-safe JSON escaping")
	}
}

func TestDecodeRejectsUnknownFields(t *testing.T) {
	contents, err := os.ReadFile("../../testdata/report-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	contents = bytes.Replace(contents, []byte(`"schemaVersion": 1`), []byte(`"schemaVersion": 1, "unexpected": true`), 1)
	if _, err := Decode(bytes.NewReader(contents)); err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("Decode() error = %v, want unknown-field rejection", err)
	}
}

func TestValidateRejectsFalseParentVisibilityAndLimit(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Document)
	}{
		{
			name: "missing visible parent",
			mutate: func(document *Document) {
				document.Commits[0].Parents[1].Visibility = string(history.ParentVisible)
			},
		},
		{
			name: "included boundary parent",
			mutate: func(document *Document) {
				document.Commits[0].Parents[0].Visibility = string(history.ParentMaximumBoundary)
			},
		},
		{
			name: "included count exceeds maximum",
			mutate: func(document *Document) {
				document.Selection.MaximumCount = 1
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document := fixtureDocument(t)
			test.mutate(&document)
			if err := document.Validate(); err == nil {
				t.Fatal("Validate() unexpectedly succeeded")
			}
		})
	}
}

func TestValidateRejectsNoncanonicalGraphFlow(t *testing.T) {
	boundaryOID := strings.Repeat("c", 40)
	tests := []struct {
		name   string
		mutate func(*Document)
	}{
		{
			name: "sparse lane states",
			mutate: func(document *Document) {
				document.Graph.Rows[0].Outgoing[0].Lane = 1
			},
		},
		{
			name: "duplicate active object ID",
			mutate: func(document *Document) {
				oid := document.Commits[1].OID
				document.Graph.Rows[0].Outgoing = append(document.Graph.Rows[0].Outgoing, LaneState{Lane: 1, ExpectedOID: &oid})
			},
		},
		{
			name: "trailing empty lane",
			mutate: func(document *Document) {
				document.Graph.Rows[0].Outgoing = append(document.Graph.Rows[0].Outgoing, LaneState{Lane: 1})
			},
		},
		{
			name: "row state discontinuity",
			mutate: func(document *Document) {
				document.Graph.Rows[1].Incoming[0].ExpectedOID = &boundaryOID
			},
		},
		{
			name: "extra continuation",
			mutate: func(document *Document) {
				row := &document.Graph.Rows[0]
				row.Transitions = append([]Transition{{FromLane: 0, ToLane: 0, Kind: string(graph.RelationshipContinuation)}}, row.Transitions...)
			},
		},
		{
			name: "parent starts outside node lane",
			mutate: func(document *Document) {
				document.Graph.Rows[0].Transitions[0].FromLane = 1
			},
		},
		{
			name: "boundary activated",
			mutate: func(document *Document) {
				document.Graph.Rows[0].Outgoing = append(document.Graph.Rows[0].Outgoing, LaneState{Lane: 1, ExpectedOID: &boundaryOID})
			},
		},
		{
			name: "inflated lane count",
			mutate: func(document *Document) {
				document.Graph.LaneCount++
			},
		},
		{
			name: "final outgoing lane",
			mutate: func(document *Document) {
				document.Graph.Rows[1].Outgoing = []LaneState{{Lane: 0, ExpectedOID: &boundaryOID}}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document := fixtureDocument(t)
			test.mutate(&document)
			if err := document.Validate(); err == nil {
				t.Fatal("Validate() unexpectedly succeeded")
			}
		})
	}
}

func TestNewDocumentConvertsDomainTypes(t *testing.T) {
	full := history.ObjectID(strings.Repeat("d", 40))
	abbreviated := history.ObjectID(strings.Repeat("d", 12))
	when := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	snapshot := history.Snapshot{
		Repository: history.Repository{
			DisplayName: "example",
			Head:        history.HeadState{Kind: history.HeadBranch, Branch: "main", OID: &full},
		},
		Selection: history.Selection{Scope: history.ScopeAll, Maximum: 10},
		Commits: []history.Commit{{
			OID:            full,
			AbbreviatedOID: abbreviated,
			Author:         history.Person{Name: "A", Email: "a@example.test", When: when},
			Committer:      history.Person{Name: "A", Email: "a@example.test", When: when},
			Subject:        "root",
			RawMessage:     "root",
		}},
	}
	layout := graph.Layout{LaneCount: 1, Rows: []graph.Row{{CommitOID: full, NodeLane: 0}}}

	document, err := NewDocument(Generator{Name: "gitlog-html"}, when, snapshot, layout)
	if err != nil {
		t.Fatalf("NewDocument(): %v", err)
	}
	if document.Commits[0].OID != string(full) || document.Commits[0].AbbreviatedOID != string(abbreviated) {
		t.Fatalf("NewDocument() object IDs = %q, %q", document.Commits[0].OID, document.Commits[0].AbbreviatedOID)
	}
}

func TestDeterministicDependencySeams(t *testing.T) {
	wantTime := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	clock := ClockFunc(func() time.Time { return wantTime })
	nonce := NonceFunc(func() (string, error) { return "fixed-nonce", nil })

	if got := clock.Now(); !got.Equal(wantTime) {
		t.Fatalf("ClockFunc.Now() = %v", got)
	}
	if got, err := nonce.Nonce(); err != nil || got != "fixed-nonce" {
		t.Fatalf("NonceFunc.Nonce() = %q, %v", got, err)
	}
}

func fixtureDocument(t *testing.T) Document {
	t.Helper()
	contents, err := os.ReadFile("../../testdata/report-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	document, err := Decode(bytes.NewReader(contents))
	if err != nil {
		t.Fatal(err)
	}
	return document
}
