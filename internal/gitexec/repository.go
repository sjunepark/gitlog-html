package gitexec

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/sjunepark/gitlog-html/internal/history"
)

type NotRepositoryError struct {
	Path string
	Err  error
}

func (err *NotRepositoryError) Error() string {
	return fmt.Sprintf("discover repository from %q: %v", err.Path, err.Err)
}

func (err *NotRepositoryError) Unwrap() error { return err.Err }

type StateError struct {
	Operation string
	Err       error
}

func (err *StateError) Error() string {
	return fmt.Sprintf("resolve repository state during %s: %v", err.Operation, err.Err)
}

func (err *StateError) Unwrap() error { return err.Err }

type Loader struct {
	Runner Runner
}

// AdministrativePaths resolves every repository-owned path that report output
// must never replace. Linked worktrees have both a per-worktree Git directory
// and a shared common directory, while their .git entry is itself a control
// file that also needs protection.
func (loader Loader) AdministrativePaths(ctx context.Context, root string) ([]string, error) {
	gitDir, err := loader.Runner.Run(ctx, root, "rev-parse", "--absolute-git-dir")
	if err != nil {
		return nil, &StateError{Operation: "Git administrative directory", Err: err}
	}
	commonDir, err := loader.Runner.Run(ctx, root, "rev-parse", "--git-common-dir")
	if err != nil {
		return nil, &StateError{Operation: "Git common directory", Err: err}
	}

	return resolveAdministrativePaths(root,
		trimTransportLine(gitDir.Stdout),
		trimTransportLine(commonDir.Stdout),
	)
}

func resolveAdministrativePaths(root string, reported ...string) ([]string, error) {
	for _, path := range reported {
		if path == "" {
			return nil, &StateError{Operation: "Git administrative paths", Err: errors.New("git reported an empty path")}
		}
	}
	candidates := append([]string{filepath.Join(root, ".git")}, reported...)
	paths := make([]string, 0, len(candidates))
	for index, path := range candidates {
		if !filepath.IsAbs(path) {
			path = filepath.Join(root, path)
		}
		resolved, resolveErr := filepath.EvalSymlinks(path)
		// root/.git is a defensive control-path candidate rather than a path
		// reported by Git. Some valid worktree configurations omit it, but the
		// reserved location still must not become report output. Resolve its
		// existing parent while the two Git-reported paths remain mandatory.
		if index == 0 && errors.Is(resolveErr, os.ErrNotExist) {
			parent, parentErr := filepath.EvalSymlinks(filepath.Dir(path))
			if parentErr != nil {
				return nil, &StateError{Operation: "Git administrative paths", Err: fmt.Errorf("resolve parent of %q: %w", path, parentErr)}
			}
			paths = append(paths, filepath.Join(parent, filepath.Base(path)))
			continue
		}
		if resolveErr != nil {
			return nil, &StateError{Operation: "Git administrative paths", Err: fmt.Errorf("resolve %q: %w", path, resolveErr)}
		}
		paths = append(paths, filepath.Clean(resolved))
	}
	return paths, nil
}

func (loader Loader) Discover(ctx context.Context, path string) (history.Repository, error) {
	result, err := loader.Runner.Run(ctx, path, "rev-parse", "--show-toplevel")
	if err != nil {
		var exit *ExitError
		if errors.As(err, &exit) {
			return history.Repository{}, &NotRepositoryError{Path: path, Err: err}
		}
		return history.Repository{}, err
	}
	root := trimTransportLine(result.Stdout)
	if root == "" {
		return history.Repository{}, &StateError{Operation: "repository root", Err: errors.New("empty top-level path reported by Git")}
	}

	branch, branchErr := loader.Runner.Run(ctx, root, "symbolic-ref", "--quiet", "--no-recurse", "HEAD")
	_, rawHeadErr := loader.Runner.Run(ctx, root, "rev-parse", "--verify", "HEAD")
	head, headErr := loader.Runner.Run(ctx, root, "rev-parse", "--verify", "HEAD^{commit}")
	fullBranchName := trimTransportLine(branch.Stdout)
	if branchErr == nil && !utf8.ValidString(fullBranchName) {
		return history.Repository{}, &StateError{Operation: "symbolic HEAD", Err: errors.New("branch name is not valid UTF-8")}
	}
	branchName, isBranch := strings.CutPrefix(fullBranchName, "refs/heads/")

	var headOID *history.ObjectID
	if headErr == nil {
		parsed, parseErr := history.ParseObjectID(trimTransportLine(head.Stdout))
		if parseErr != nil {
			return history.Repository{}, &StateError{Operation: "HEAD object ID", Err: parseErr}
		}
		headOID = &parsed
	} else if !isExpectedExit(headErr) {
		return history.Repository{}, headErr
	}

	var state history.HeadState
	switch {
	case branchErr == nil && (!isBranch || branchName == ""):
		return history.Repository{}, &StateError{Operation: "symbolic HEAD", Err: fmt.Errorf("HEAD points outside local branches: %q", fullBranchName)}
	case branchErr == nil && branchName != "" && headOID != nil && rawHeadErr == nil:
		state = history.HeadState{Kind: history.HeadBranch, Branch: branchName, OID: headOID}
	case branchErr == nil && branchName != "" && headOID == nil && isExpectedExit(rawHeadErr):
		stored, storageErr := loader.referenceStored(ctx, root, fullBranchName)
		if storageErr != nil {
			return history.Repository{}, storageErr
		}
		if stored {
			return history.Repository{}, &StateError{Operation: "branch HEAD", Err: headErr}
		}
		state = history.HeadState{Kind: history.HeadUnborn, Branch: branchName}
	case branchErr == nil && branchName != "":
		return history.Repository{}, &StateError{Operation: "branch HEAD", Err: errors.Join(rawHeadErr, headErr)}
	case isExpectedExit(branchErr) && headOID != nil:
		state = history.HeadState{Kind: history.HeadDetached, OID: headOID}
	default:
		if branchErr == nil {
			branchErr = errors.New("empty symbolic HEAD reported by Git")
		}
		return history.Repository{}, &StateError{Operation: "HEAD", Err: errors.Join(branchErr, headErr)}
	}
	if err := state.Validate(); err != nil {
		return history.Repository{}, &StateError{Operation: "HEAD", Err: err}
	}
	return history.Repository{Root: root, DisplayName: filepath.Base(root), Head: state}, nil
}

// referenceStored distinguishes an absent unborn branch from a loose branch
// whose stored value Git cannot resolve. Valid packed refs resolve before this
// check, so only the ambiguous failure path needs filesystem metadata.
func (loader Loader) referenceStored(ctx context.Context, root, fullName string) (bool, error) {
	_, probeErr := loader.Runner.Run(ctx, root, "show-ref", "--verify", "--quiet", fullName)
	if probeErr == nil {
		return true, nil
	}
	var exitErr *ExitError
	if !errors.As(probeErr, &exitErr) || exitErr.Code != 1 {
		return false, &StateError{Operation: "branch ref storage", Err: probeErr}
	}

	// show-ref reports exit 1 for both an absent ref and some broken loose
	// refs. Consult the Git-resolved loose path only for that ambiguity. A
	// malformed packed-refs file fails show-ref with a different exit status.
	result, err := loader.Runner.Run(ctx, root, "rev-parse", "--git-path", fullName)
	if err != nil {
		return false, err
	}
	path := trimTransportLine(result.Stdout)
	if !filepath.IsAbs(path) {
		path = filepath.Join(root, path)
	}
	_, err = os.Lstat(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, &StateError{Operation: "branch ref storage", Err: err}
}

func isExpectedExit(err error) bool {
	if err == nil {
		return false
	}
	var exit *ExitError
	return errors.As(err, &exit)
}

func trimTransportLine(output []byte) string {
	return strings.TrimSuffix(string(output), "\n")
}
