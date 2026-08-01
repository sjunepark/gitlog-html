package gitexec

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"sort"
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
		sort.Slice(commits[index].Refs, func(left, right int) bool {
			return refLess(commits[index].Refs[left], commits[index].Refs[right])
		})
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

func refLess(left, right history.Ref) bool {
	order := map[history.RefKind]int{
		history.RefLocalBranch:  0,
		history.RefRemoteBranch: 1,
		history.RefTag:          2,
		history.RefOther:        3,
	}
	if order[left.Kind] != order[right.Kind] {
		return order[left.Kind] < order[right.Kind]
	}
	if left.DisplayName != right.DisplayName {
		return left.DisplayName < right.DisplayName
	}
	return left.FullName < right.FullName
}
