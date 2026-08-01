package gitexec

import (
	"bytes"
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/sjunepark/gitlog-html/internal/history"
)

func (loader Loader) attachRefs(ctx context.Context, repository history.Repository, commits []history.Commit) error {
	byOID := make(map[history.ObjectID]*history.Commit, len(commits))
	for index := range commits {
		byOID[commits[index].OID] = &commits[index]
	}
	result, err := loader.Runner.Run(ctx, repository.Root, "for-each-ref", "--format=%(refname)%00%(objecttype)%00%(objectname)%00%(*objecttype)%00%(*objectname)%00")
	if err != nil {
		return err
	}
	if err := parseRefs(result.Stdout, repository.Head, byOID); err != nil {
		return err
	}
	if repository.Head.Kind == history.HeadDetached && repository.Head.OID != nil {
		if commit := byOID[*repository.Head.OID]; commit != nil {
			commit.Refs = append(commit.Refs, history.Ref{FullName: "HEAD", DisplayName: "HEAD", Kind: history.RefOther, IsHEAD: true})
		}
	}
	for index := range commits {
		slices.SortFunc(commits[index].Refs, compareRefs)
	}
	return nil
}

func parseRefs(output []byte, head history.HeadState, byOID map[history.ObjectID]*history.Commit) error {
	if len(output) == 0 {
		return nil
	}
	records := bytes.Split(output, []byte{0, '\n'})
	if len(records[len(records)-1]) == 0 {
		records = records[:len(records)-1]
	}
	for index, record := range records {
		if !utf8.Valid(record) {
			return &ParseError{Operation: "for-each-ref", Record: index, Field: "ref", Err: errors.New("ref record is not valid UTF-8")}
		}
		fields := bytes.Split(record, []byte{0})
		if len(fields) != 5 {
			return &ParseError{Operation: "for-each-ref", Record: index, Field: "ref", Err: fmt.Errorf("got %d fields, want 5", len(fields))}
		}
		fullName := string(fields[0])
		if fullName == "" {
			return &ParseError{Operation: "for-each-ref", Record: index, Field: "ref name", Err: errors.New("empty ref name")}
		}
		objectType, objectID := string(fields[1]), string(fields[2])
		peeledType, peeledID := string(fields[3]), string(fields[4])
		var targetText string
		switch {
		case objectType == "commit":
			targetText = objectID
		case peeledType == "commit":
			targetText = peeledID
		default:
			continue
		}
		target, err := history.ParseObjectID(targetText)
		if err != nil {
			return &ParseError{Operation: "for-each-ref", Record: index, Field: "ref target", Err: err}
		}
		commit := byOID[target]
		if commit == nil {
			continue
		}
		kind, display := classifyRef(fullName)
		isHEAD := head.Kind == history.HeadBranch && fullName == "refs/heads/"+head.Branch
		commit.Refs = append(commit.Refs, history.Ref{FullName: fullName, DisplayName: display, Kind: kind, IsHEAD: isHEAD})
	}
	return nil
}

func classifyRef(fullName string) (history.RefKind, string) {
	classifications := []struct {
		prefix string
		kind   history.RefKind
	}{
		{"refs/heads/", history.RefLocalBranch},
		{"refs/remotes/", history.RefRemoteBranch},
		{"refs/tags/", history.RefTag},
	}
	for _, classification := range classifications {
		if strings.HasPrefix(fullName, classification.prefix) {
			return classification.kind, strings.TrimPrefix(fullName, classification.prefix)
		}
	}
	return history.RefOther, fullName
}

var refKindOrder = map[history.RefKind]int{
	history.RefLocalBranch:  0,
	history.RefRemoteBranch: 1,
	history.RefTag:          2,
	history.RefOther:        3,
}

func compareRefs(left, right history.Ref) int {
	if order := cmp.Compare(refKindOrder[left.Kind], refKindOrder[right.Kind]); order != 0 {
		return order
	}
	if order := cmp.Compare(left.DisplayName, right.DisplayName); order != 0 {
		return order
	}
	return cmp.Compare(left.FullName, right.FullName)
}
