package gitexec

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sjunepark/gitlog-html/internal/history"
)

func TestParseHistoryPreservesStructuredText(t *testing.T) {
	oid := strings.Repeat("a", 40)
	parent := strings.Repeat("b", 64)
	fields := []string{
		oid,
		oid[:12],
		parent,
		"홍길동\n<script>",
		"author@example.test",
		"2026-08-01T10:00:00+09:00",
		"Committer",
		"committer@example.test",
		"2026-08-01T10:01:00+09:00",
		"subject </script>\n\nbody 안녕하세요\n",
	}
	output := []byte(strings.Join(fields, "\x00") + "\x00")

	commits, err := parseHistory(output)
	if err != nil {
		t.Fatalf("parseHistory(): %v", err)
	}
	if len(commits) != 1 {
		t.Fatalf("len(commits) = %d", len(commits))
	}
	commit := commits[0]
	if commit.Subject != "subject </script>" || commit.RawMessage != fields[9] || commit.Author.Name != fields[3] {
		t.Fatalf("parsed commit lost text: %#v", commit)
	}
	if len(commit.Parents) != 1 || string(commit.Parents[0].OID) != parent {
		t.Fatalf("parents = %#v", commit.Parents)
	}
}

func TestParseHistoryReturnsRecordAndFieldErrors(t *testing.T) {
	tests := []struct {
		name   string
		output []byte
		field  string
	}{
		{name: "not terminated", output: []byte("abc"), field: ""},
		{name: "wrong field count", output: []byte("abc\x00"), field: ""},
		{
			name: "invalid object ID",
			output: []byte(strings.Join([]string{
				"INVALID", "abc", "", "a", "a@example.test", "2026-08-01T00:00:00Z",
				"c", "c@example.test", "2026-08-01T00:00:00Z", "message",
			}, "\x00") + "\x00"),
			field: "object ID",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := parseHistory(test.output)
			var parseErr *ParseError
			if !errors.As(err, &parseErr) {
				t.Fatalf("error = %T %v, want ParseError", err, err)
			}
			if parseErr.Field != test.field {
				t.Fatalf("field = %q, want %q", parseErr.Field, test.field)
			}
			if parseErr.Operation != "log" {
				t.Fatalf("operation = %q, want log", parseErr.Operation)
			}
		})
	}
}

func TestParseRefsPeelsTagsAndMarksBranchHEAD(t *testing.T) {
	oid := history.ObjectID(strings.Repeat("a", 40))
	commit := history.Commit{OID: oid}
	byOID := map[history.ObjectID]*history.Commit{oid: &commit}
	records := [][]byte{
		[]byte("refs/heads/main\x00commit\x00" + string(oid) + "\x00\x00"),
		[]byte("refs/tags/v1\x00tag\x00" + strings.Repeat("b", 40) + "\x00commit\x00" + string(oid)),
	}
	output := bytes.Join(records, []byte{0, '\n'})
	output = append(output, 0, '\n')

	err := parseRefs(output, history.HeadState{Kind: history.HeadBranch, Branch: "main", OID: &oid}, byOID)
	if err != nil {
		t.Fatalf("parseRefs(): %v", err)
	}
	if len(commit.Refs) != 2 {
		t.Fatalf("refs = %#v", commit.Refs)
	}
	if !commit.Refs[0].IsHEAD || commit.Refs[1].Kind != history.RefTag {
		t.Fatalf("refs = %#v", commit.Refs)
	}
}

func TestParseRefsReportsItsOperation(t *testing.T) {
	err := parseRefs([]byte("invalid\x00record\n"), history.HeadState{}, map[history.ObjectID]*history.Commit{})
	var parseErr *ParseError
	if !errors.As(err, &parseErr) {
		t.Fatalf("error = %T %v, want ParseError", err, err)
	}
	if parseErr.Operation != "for-each-ref" {
		t.Fatalf("operation = %q, want for-each-ref", parseErr.Operation)
	}
}

func TestReadBoundedMetadataRejectsOversizedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "metadata")
	if err := os.WriteFile(path, []byte("123456789"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := readBoundedMetadata(path, 8)
	var limitErr *OutputLimitError
	if !errors.As(err, &limitErr) {
		t.Fatalf("error = %T %v, want OutputLimitError", err, err)
	}
	if limitErr.Operation != "metadata" || limitErr.Limit != 8 {
		t.Fatalf("OutputLimitError = %#v", limitErr)
	}
}

func TestParseCommitObjectParents(t *testing.T) {
	first := strings.Repeat("a", 40)
	second := strings.Repeat("b", 64)
	contents := []byte("tree " + strings.Repeat("c", 40) + "\nparent " + first + "\nparent " + second + "\nauthor A <a@example.test> 1 +0000\n\nmessage\n")
	parents, err := parseCommitObjectParents(contents)
	if err != nil {
		t.Fatalf("parseCommitObjectParents(): %v", err)
	}
	if len(parents) != 2 || string(parents[0].OID) != first || string(parents[1].OID) != second {
		t.Fatalf("parents = %#v", parents)
	}
}
