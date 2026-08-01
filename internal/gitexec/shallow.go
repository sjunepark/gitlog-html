package gitexec

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/sjunepark/gitlog-html/internal/history"
)

func (loader Loader) shallowCommits(ctx context.Context, root string) (map[history.ObjectID]struct{}, error) {
	result, err := loader.Runner.Run(ctx, root, "rev-parse", "--is-shallow-repository")
	if err != nil {
		return nil, err
	}
	shallow := make(map[history.ObjectID]struct{})
	if trimTransportLine(result.Stdout) != "true" {
		return shallow, nil
	}
	pathResult, err := loader.Runner.Run(ctx, root, "rev-parse", "--git-path", "shallow")
	if err != nil {
		return nil, err
	}
	path := trimTransportLine(pathResult.Stdout)
	if !filepath.IsAbs(path) {
		path = filepath.Join(root, path)
	}
	contents, err := readBoundedMetadata(path, DefaultMaxStdoutBytes)
	if err != nil {
		return nil, &StateError{Operation: "shallow boundary file", Err: err}
	}
	for index, line := range strings.Split(strings.TrimSuffix(string(contents), "\n"), "\n") {
		if line == "" {
			continue
		}
		oid, err := history.ParseObjectID(strings.TrimSuffix(line, "\r"))
		if err != nil {
			return nil, &ParseError{Operation: "shallow metadata", Record: index, Field: "shallow object ID", Err: err}
		}
		shallow[oid] = struct{}{}
	}
	return shallow, nil
}

func (loader Loader) recoverShallowParents(ctx context.Context, root string, commits []history.Commit, shallow map[history.ObjectID]struct{}) error {
	for index := range commits {
		if _, ok := shallow[commits[index].OID]; !ok || len(commits[index].Parents) > 0 {
			continue
		}
		result, err := loader.Runner.Run(ctx, root, "cat-file", "-p", string(commits[index].OID))
		if err != nil {
			return err
		}
		parents, err := parseCommitObjectParents(result.Stdout)
		if err != nil {
			return &ParseError{Operation: "cat-file", Record: index, Field: "shallow parents", Err: err}
		}
		commits[index].Parents = parents
	}
	return nil
}

func readBoundedMetadata(path string, maximum int) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	contents, readErr := io.ReadAll(io.LimitReader(file, int64(maximum)+1))
	closeErr := file.Close()
	if readErr != nil {
		return nil, readErr
	}
	if closeErr != nil {
		return nil, closeErr
	}
	if len(contents) > maximum {
		return nil, &OutputLimitError{Operation: "metadata", Limit: maximum}
	}
	return contents, nil
}

func parseCommitObjectParents(contents []byte) ([]history.Parent, error) {
	scanner := bufio.NewScanner(bytes.NewReader(contents))
	parents := []history.Parent{}
	foundHeaderEnd := false
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			foundHeaderEnd = true
			break
		}
		if !strings.HasPrefix(line, "parent ") {
			continue
		}
		oid, err := history.ParseObjectID(strings.TrimPrefix(line, "parent "))
		if err != nil {
			return nil, err
		}
		parents = append(parents, history.Parent{OID: oid})
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if !foundHeaderEnd {
		return nil, errors.New("commit object has no header terminator")
	}
	return parents, nil
}
