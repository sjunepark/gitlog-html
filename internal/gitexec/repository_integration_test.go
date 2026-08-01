package gitexec

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/sjunepark/gitlog-html/internal/history"
)

func TestLoaderResolvesStandardAndLinkedWorktreeAdministrativePaths(t *testing.T) {
	repository := newFixtureRepository(t, "sha1")
	oid := repository.commit(fixedCommit("root", 0))
	repository.updateRef("refs/heads/main", oid)
	linked := filepath.Join(t.TempDir(), "linked")
	repository.git(nil, "worktree", "add", "-b", "linked", linked, "main")

	loader := Loader{Runner: Runner{}}
	for _, root := range []string{repository.path, linked} {
		paths, err := loader.AdministrativePaths(context.Background(), root)
		if err != nil {
			t.Fatalf("AdministrativePaths(%q): %v", root, err)
		}
		controlPath, err := filepath.EvalSymlinks(filepath.Join(root, ".git"))
		if err != nil {
			t.Fatal(err)
		}
		if !slices.Contains(paths, filepath.Clean(controlPath)) {
			t.Fatalf("paths for %q = %q, want control path %q", root, paths, controlPath)
		}
	}

	linkedPaths, err := loader.AdministrativePaths(context.Background(), linked)
	if err != nil {
		t.Fatal(err)
	}
	common, err := filepath.EvalSymlinks(filepath.Join(repository.path, ".git"))
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(linkedPaths, filepath.Clean(common)) {
		t.Fatalf("linked paths = %q, want common directory %q", linkedPaths, common)
	}
}

func TestLoaderReportsTypedRepositoryAndExecutableFailures(t *testing.T) {
	t.Run("not a repository", func(t *testing.T) {
		_, err := (Loader{Runner: Runner{}}).Snapshot(context.Background(), t.TempDir(), history.ScopeAll, 10)
		var repositoryErr *NotRepositoryError
		if !errors.As(err, &repositoryErr) {
			t.Fatalf("Snapshot() error = %T %v, want NotRepositoryError", err, err)
		}
	})

	t.Run("Git unavailable", func(t *testing.T) {
		executable := filepath.Join(t.TempDir(), "missing-git")
		_, err := (Loader{Runner: Runner{Executable: executable}}).Snapshot(context.Background(), t.TempDir(), history.ScopeAll, 10)
		var missingErr *MissingExecutableError
		if !errors.As(err, &missingErr) {
			t.Fatalf("Snapshot() error = %T %v, want MissingExecutableError", err, err)
		}
	})

}

func TestLoaderDiscoversRepositoryBelowInheritedCeiling(t *testing.T) {
	repository := newFixtureRepository(t, "sha1")
	descendant := filepath.Join(repository.path, "nested", "deeper")
	if err := os.MkdirAll(descendant, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GIT_CEILING_DIRECTORIES", filepath.Dir(descendant))

	discovered, err := (Loader{Runner: Runner{}}).Discover(context.Background(), descendant)
	if err != nil {
		t.Fatalf("Discover(): %v", err)
	}
	wantRoot, err := filepath.EvalSymlinks(repository.path)
	if err != nil {
		t.Fatal(err)
	}
	if discovered.Root != wantRoot {
		t.Fatalf("repository root = %q, want %q", discovered.Root, wantRoot)
	}
}

func TestLoaderRejectsNonUTF8SymbolicHEAD(t *testing.T) {
	repository := newFixtureRepository(t, "sha1")
	headPath := filepath.Join(repository.path, ".git", "HEAD")
	if err := os.WriteFile(headPath, []byte("ref: refs/heads/bad\xff\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := (Loader{Runner: Runner{}}).Discover(context.Background(), repository.path)
	var stateErr *StateError
	if !errors.As(err, &stateErr) || stateErr.Operation != "symbolic HEAD" {
		t.Fatalf("Discover() error = %T %v, want symbolic-HEAD StateError", err, err)
	}
}

func TestLoaderRejectsInvalidSelectionBeforeRunningGit(t *testing.T) {
	missing := Runner{Executable: filepath.Join(t.TempDir(), "missing-git")}
	loader := Loader{Runner: missing}
	if _, err := loader.Snapshot(context.Background(), "", history.Scope("invalid"), 10); err == nil {
		t.Fatal("invalid scope unexpectedly succeeded")
	} else {
		var missingErr *MissingExecutableError
		if errors.As(err, &missingErr) {
			t.Fatal("invalid scope reached Git")
		}
	}
	if _, err := loader.Snapshot(context.Background(), "", history.ScopeAll, 0); err == nil {
		t.Fatal("zero maximum unexpectedly succeeded")
	} else {
		var missingErr *MissingExecutableError
		if errors.As(err, &missingErr) {
			t.Fatal("invalid maximum reached Git")
		}
	}
}
