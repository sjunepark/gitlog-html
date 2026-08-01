package generate

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sjunepark/gitlog-html/internal/history"
	"github.com/sjunepark/gitlog-html/internal/report"
)

type loaderFunc func(context.Context, string, history.Scope, int) (history.Snapshot, error)

func (function loaderFunc) Snapshot(ctx context.Context, path string, scope history.Scope, maximum int) (history.Snapshot, error) {
	return function(ctx, path, scope, maximum)
}

func TestServiceBuildsExplainedReport(t *testing.T) {
	when := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	oid := history.ObjectID(strings.Repeat("a", 40))
	directory := t.TempDir()
	descriptionsPath := filepath.Join(directory, "descriptions.json")
	descriptions, err := json.Marshal(map[string]string{string(oid): "why it changed", strings.Repeat("b", 40): "outside"})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(descriptionsPath, descriptions, 0o600); err != nil {
		t.Fatal(err)
	}
	outputPath := filepath.Join(directory, "report.html")
	loader := loaderFunc(func(_ context.Context, path string, scope history.Scope, maximum int) (history.Snapshot, error) {
		if path != directory || scope != history.ScopeAll || maximum != 10 {
			t.Fatalf("Snapshot(%q, %q, %d)", path, scope, maximum)
		}
		return history.Snapshot{
			Repository: history.Repository{DisplayName: "example", Head: history.HeadState{Kind: history.HeadBranch, Branch: "main", OID: &oid}},
			Selection:  history.Selection{Scope: scope, Maximum: maximum},
			Commits: []history.Commit{{
				OID: oid, AbbreviatedOID: history.ObjectID(strings.Repeat("a", 12)),
				Author:    history.Person{Name: "A", Email: "a@example.test", When: when},
				Committer: history.Person{Name: "A", Email: "a@example.test", When: when},
				Subject:   "subject", RawMessage: "subject",
			}},
		}, nil
	})

	result, err := (Service{
		Loader:      loader,
		Clock:       report.ClockFunc(func() time.Time { return when }),
		NonceSource: report.NonceFunc(func() (string, error) { return "fixed-nonce", nil }),
		Generator:   report.Generator{Name: "gitlog-html", Version: "test"},
	}).Run(context.Background(), Request{
		Repository: directory, Scope: history.ScopeAll, Maximum: 10,
		DescriptionsPath: descriptionsPath, OutputPath: outputPath,
	})
	if err != nil {
		t.Fatalf("Run(): %v", err)
	}
	resolvedParent, err := filepath.EvalSymlinks(filepath.Dir(outputPath))
	if err != nil {
		t.Fatal(err)
	}
	wantOutput := filepath.Join(resolvedParent, filepath.Base(outputPath))
	if result.OutputPath != wantOutput || result.IncludedCount != 1 || len(result.Warnings) != 1 {
		t.Fatalf("result = %#v", result)
	}
	contents, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(contents), "why it changed") || !strings.Contains(string(contents), "Ignored 1 description") {
		t.Fatalf("report is missing explanation or warning")
	}
}

func TestServiceReportsResolvedMissingDescriptionPath(t *testing.T) {
	directory := t.TempDir()
	missing := filepath.Join(directory, "missing.json")
	loader := loaderFunc(func(context.Context, string, history.Scope, int) (history.Snapshot, error) {
		return history.Snapshot{}, nil
	})
	_, err := (Service{Loader: loader}).Run(context.Background(), Request{
		Repository: directory, Scope: history.ScopeAll, Maximum: 10,
		DescriptionsPath: missing, OutputPath: filepath.Join(directory, "report.html"),
	})
	if err == nil || !strings.Contains(err.Error(), missing) {
		t.Fatalf("Run() error = %v, want resolved path", err)
	}
}
