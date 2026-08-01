package gitexec

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/sjunepark/gitlog-html/internal/history"
)

const historyFieldCount = 10

type ParseError struct {
	Operation string
	Record    int
	Field     string
	Err       error
}

func (err *ParseError) Error() string {
	operation := err.Operation
	if operation == "" {
		operation = "output"
	}
	if err.Field == "" {
		return fmt.Sprintf("parse Git %s record %d: %v", operation, err.Record, err.Err)
	}
	return fmt.Sprintf("parse Git %s record %d field %s: %v", operation, err.Record, err.Field, err.Err)
}

func (err *ParseError) Unwrap() error { return err.Err }

func (loader Loader) Snapshot(ctx context.Context, path string, scope history.Scope, maximum int) (history.Snapshot, error) {
	if _, err := history.ParseScope(string(scope)); err != nil {
		return history.Snapshot{}, err
	}
	if maximum <= 0 {
		return history.Snapshot{}, errors.New("maximum commit count must be positive")
	}
	repository, err := loader.Discover(ctx, path)
	if err != nil {
		return history.Snapshot{}, err
	}

	commits, hadExtra, err := loader.loadCommits(ctx, repository, scope, maximum)
	if err != nil {
		return history.Snapshot{}, err
	}
	shallow, err := loader.shallowCommits(ctx, repository.Root)
	if err != nil {
		return history.Snapshot{}, err
	}
	if err := loader.recoverShallowParents(ctx, repository.Root, commits, shallow); err != nil {
		return history.Snapshot{}, err
	}

	visible := make(map[history.ObjectID]struct{}, len(commits))
	for _, commit := range commits {
		visible[commit.OID] = struct{}{}
	}
	truncated := hadExtra
	shallowBoundary := false
	for commitIndex := range commits {
		for parentIndex := range commits[commitIndex].Parents {
			parent := &commits[commitIndex].Parents[parentIndex]
			if _, ok := visible[parent.OID]; ok {
				parent.Visibility = history.ParentVisible
				continue
			}
			if _, ok := shallow[commits[commitIndex].OID]; ok {
				parent.Visibility = history.ParentShallowBoundary
				shallowBoundary = true
				continue
			}
			parent.Visibility = history.ParentMaximumBoundary
			truncated = true
		}
	}

	if err := loader.attachRefs(ctx, repository, commits); err != nil {
		return history.Snapshot{}, err
	}
	for index := range commits {
		if err := commits[index].Validate(); err != nil {
			return history.Snapshot{}, &ParseError{Operation: "log", Record: index, Err: err}
		}
	}

	warnings := []history.Warning{}
	if shallowBoundary {
		warnings = append(warnings, history.Warning{
			Code:    history.WarningIncompleteHistory,
			Message: "This repository is shallow; at least one parent continues beyond the available local history.",
		})
	}
	return history.Snapshot{
		Repository: repository,
		Selection: history.Selection{
			Scope:     scope,
			Maximum:   maximum,
			Truncated: truncated,
		},
		Commits:  commits,
		Warnings: warnings,
	}, nil
}

func (loader Loader) loadCommits(ctx context.Context, repository history.Repository, scope history.Scope, maximum int) ([]history.Commit, bool, error) {
	if scope == history.ScopeCurrent && repository.Head.Kind == history.HeadUnborn {
		return []history.Commit{}, false, nil
	}
	fetchMaximum := maximum
	if maximum < math.MaxInt {
		fetchMaximum++
	}
	format := "%H%x00%h%x00%P%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%B"
	args := []string{
		"--no-pager", "log", "--topo-order", "--no-show-signature", "--no-color", "--no-decorate",
		"--encoding=UTF-8", "--max-count=" + strconv.Itoa(fetchMaximum), "--format=" + format, "-z",
	}
	if scope == history.ScopeAll {
		args = append(args, "--all")
	} else {
		args = append(args, "HEAD")
	}
	result, err := loader.Runner.Run(ctx, repository.Root, args...)
	if err != nil {
		return nil, false, err
	}
	commits, err := parseHistory(result.Stdout)
	if err != nil {
		return nil, false, err
	}
	hadExtra := len(commits) > maximum
	if hadExtra {
		commits = commits[:maximum]
	}
	return commits, hadExtra, nil
}

func parseHistory(output []byte) ([]history.Commit, error) {
	if len(output) == 0 {
		return []history.Commit{}, nil
	}
	fields := bytes.Split(output, []byte{0})
	if len(fields) == 0 || len(fields[len(fields)-1]) != 0 {
		return nil, &ParseError{Operation: "log", Record: len(fields) / historyFieldCount, Err: errors.New("history output is not NUL-terminated")}
	}
	fields = fields[:len(fields)-1]
	if len(fields)%historyFieldCount != 0 {
		return nil, &ParseError{Operation: "log", Record: len(fields) / historyFieldCount, Err: fmt.Errorf("got %d fields, expected a multiple of %d", len(fields), historyFieldCount)}
	}
	commits := make([]history.Commit, 0, len(fields)/historyFieldCount)
	for record := 0; record < len(fields)/historyFieldCount; record++ {
		values := fields[record*historyFieldCount : (record+1)*historyFieldCount]
		commit, err := parseCommitRecord(record, values)
		if err != nil {
			return nil, err
		}
		commits = append(commits, commit)
	}
	return commits, nil
}

func parseCommitRecord(record int, fields [][]byte) (history.Commit, error) {
	textFields := []struct {
		index int
		name  string
	}{{3, "author name"}, {4, "author email"}, {6, "committer name"}, {7, "committer email"}, {9, "raw message"}}
	for _, field := range textFields {
		if !utf8.Valid(fields[field.index]) {
			return history.Commit{}, &ParseError{Operation: "log", Record: record, Field: field.name, Err: errors.New("text is not valid UTF-8")}
		}
	}
	oid, err := history.ParseObjectID(string(fields[0]))
	if err != nil {
		return history.Commit{}, &ParseError{Operation: "log", Record: record, Field: "object ID", Err: err}
	}
	abbreviated, err := history.ParseObjectID(string(fields[1]))
	if err != nil {
		return history.Commit{}, &ParseError{Operation: "log", Record: record, Field: "abbreviated object ID", Err: err}
	}
	parents, err := parseParents(record, fields[2])
	if err != nil {
		return history.Commit{}, err
	}
	authorWhen, err := time.Parse(time.RFC3339, string(fields[5]))
	if err != nil {
		return history.Commit{}, &ParseError{Operation: "log", Record: record, Field: "author timestamp", Err: err}
	}
	committerWhen, err := time.Parse(time.RFC3339, string(fields[8]))
	if err != nil {
		return history.Commit{}, &ParseError{Operation: "log", Record: record, Field: "committer timestamp", Err: err}
	}
	rawMessage := string(fields[9])
	return history.Commit{
		OID:            oid,
		AbbreviatedOID: abbreviated,
		Author: history.Person{
			Name:  string(fields[3]),
			Email: string(fields[4]),
			When:  authorWhen,
		},
		Committer: history.Person{
			Name:  string(fields[6]),
			Email: string(fields[7]),
			When:  committerWhen,
		},
		Subject:    history.Subject(rawMessage),
		RawMessage: rawMessage,
		Parents:    parents,
		Refs:       []history.Ref{},
	}, nil
}

func parseParents(record int, field []byte) ([]history.Parent, error) {
	if len(field) == 0 {
		return []history.Parent{}, nil
	}
	values := strings.Split(string(field), " ")
	parents := make([]history.Parent, len(values))
	for index, value := range values {
		oid, err := history.ParseObjectID(value)
		if err != nil {
			return nil, &ParseError{Operation: "log", Record: record, Field: fmt.Sprintf("parent %d", index), Err: err}
		}
		parents[index].OID = oid
	}
	return parents, nil
}
