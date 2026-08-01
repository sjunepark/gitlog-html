package gitexec

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/sjunepark/gitlog-html/internal/history"
)

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
