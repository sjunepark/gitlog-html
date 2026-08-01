package graph_test

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/sjunepark/gitlog-html/internal/gitexec"
	"github.com/sjunepark/gitlog-html/internal/graph"
	"github.com/sjunepark/gitlog-html/internal/history"
)

func TestLayoutRelationsMatchRealGitFixture(t *testing.T) {
	repository := filepath.Join(t.TempDir(), "repository")
	if err := os.Mkdir(repository, 0o700); err != nil {
		t.Fatal(err)
	}
	configurationRoot := t.TempDir()
	t.Setenv("HOME", configurationRoot)
	t.Setenv("XDG_CONFIG_HOME", configurationRoot)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	environment := append(os.Environ(),
		"GIT_AUTHOR_NAME=Graph Fixture",
		"GIT_AUTHOR_EMAIL=graph@example.test",
		"GIT_COMMITTER_NAME=Graph Fixture",
		"GIT_COMMITTER_EMAIL=graph@example.test",
		"GIT_TERMINAL_PROMPT=0",
	)
	runGit(t, repository, environment, "init", "--initial-branch=main")
	runGit(t, repository, environment, "commit", "--allow-empty", "-m", "root")
	runGit(t, repository, environment, "branch", "feature")
	runGit(t, repository, environment, "commit", "--allow-empty", "-m", "main")
	runGit(t, repository, environment, "switch", "feature")
	runGit(t, repository, environment, "commit", "--allow-empty", "-m", "feature")
	runGit(t, repository, environment, "switch", "main")
	runGit(t, repository, environment, "merge", "--no-ff", "feature", "-m", "merge")

	snapshot, err := (gitexec.Loader{Runner: gitexec.Runner{}}).Snapshot(context.Background(), repository, history.ScopeAll, 100)
	if err != nil {
		t.Fatalf("Snapshot(): %v", err)
	}
	layout, err := graph.Build(snapshot.Commits)
	if err != nil {
		t.Fatalf("Build(): %v", err)
	}

	want := gitRelations(t, repository, environment)
	got := map[string]struct{}{}
	for _, row := range layout.Rows {
		for _, transition := range row.Transitions {
			if transition.ParentOID != nil && transition.Boundary == nil {
				got[string(row.CommitOID)+">"+string(*transition.ParentOID)] = struct{}{}
			}
		}
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("layout relations differ from Git:\n got: %v\nwant: %v", got, want)
	}
}

func gitRelations(t *testing.T, repository string, environment []string) map[string]struct{} {
	t.Helper()
	output := runGit(t, repository, environment, "rev-list", "--parents", "--topo-order", "--all")
	relations := map[string]struct{}{}
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		fields := strings.Fields(line)
		for _, parent := range fields[1:] {
			relations[fields[0]+">"+parent] = struct{}{}
		}
	}
	return relations
}

func runGit(t *testing.T, repository string, environment []string, arguments ...string) string {
	t.Helper()
	command := exec.Command("git", arguments...)
	command.Dir = repository
	command.Env = environment
	var stdout, stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(arguments, " "), err, stderr.String())
	}
	return stdout.String()
}

func ExampleBuild() {
	layout, _ := graph.Build([]history.Commit{
		{OID: "a", Parents: []history.Parent{{OID: "b", Visibility: history.ParentVisible}}},
		{OID: "b"},
	})
	fmt.Println(layout.LaneCount, layout.Rows[0].NodeLane, layout.Rows[1].NodeLane)
	// Output: 1 0 0
}
