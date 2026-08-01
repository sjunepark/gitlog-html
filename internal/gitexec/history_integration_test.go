package gitexec

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/sjunepark/gitlog-html/internal/history"
)

func TestLoaderSnapshotMatchesGitAndPreservesHistoryMetadata(t *testing.T) {
	repository := newFixtureRepository(t, "sha1")
	root := repository.commit(commitSpec{
		Message:        "root subject\n\nroot body",
		AuthorName:     "Root Author",
		AuthorEmail:    "root@example.test",
		AuthorDate:     "2024-01-02T03:04:05+09:00",
		CommitterName:  "Root Committer",
		CommitterEmail: "root-committer@example.test",
		CommitterDate:  "2024-01-02T03:05:06+09:00",
	})
	base := repository.commit(fixedCommit("base", 1, root))
	mainTip := repository.commit(fixedCommit("main work", 2, base))
	hostileMessage := "<script>alert(\"history\")</script> & 안녕 🌍\n\nline two\nline three\t<&>"
	featureTip := repository.commit(commitSpec{
		Message:        hostileMessage,
		Parents:        []string{base},
		AuthorName:     "Zoë 공격자 🚀",
		AuthorEmail:    "unicode-author@example.test",
		AuthorDate:     "2024-01-02T03:07:05+09:00",
		CommitterName:  "커미터 & Co.",
		CommitterEmail: "unicode-committer@example.test",
		CommitterDate:  "2024-01-02T03:08:06+09:00",
	})
	merge := repository.commit(fixedCommit("merge feature\n\nnon-fast-forward merge", 4, mainTip, featureTip))
	repository.updateRef("refs/heads/main", merge)
	repository.updateRef("refs/heads/feature", featureTip)
	repository.updateRef("refs/remotes/origin/main", mainTip)
	repository.updateRef("refs/tags/v-lightweight", base)
	repository.gitEnv(
		map[string]string{"GIT_COMMITTER_DATE": "2024-01-02T04:00:00+09:00"}, nil,
		"tag", "-a", "v-annotated", "-m", "annotated fixture tag", featureTip,
	)
	repository.git(nil, "symbolic-ref", "HEAD", "refs/heads/main")

	loader := Loader{Runner: Runner{}}
	for _, test := range []struct {
		name    string
		scope   history.Scope
		maximum int
	}{
		{name: "all refs", scope: history.ScopeAll, maximum: 100},
		{name: "current branch", scope: history.ScopeCurrent, maximum: 100},
		{name: "one global maximum", scope: history.ScopeAll, maximum: 3},
	} {
		t.Run(test.name, func(t *testing.T) {
			snapshot := loadSnapshot(t, loader, repository.path, test.scope, test.maximum)
			got := snapshotOIDs(snapshot)
			want := repository.logOIDs(test.scope, test.maximum)
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("selected object IDs differ from equivalent git log:\n got: %v\nwant: %v", got, want)
			}
			if len(got) > test.maximum {
				t.Fatalf("selected %d commits with one global maximum of %d", len(got), test.maximum)
			}
		})
	}

	snapshot := loadSnapshot(t, loader, repository.path, history.ScopeAll, 100)
	feature := commitByOID(t, snapshot, featureTip)
	if got, want := feature.RawMessage, hostileMessage; got != want {
		t.Fatalf("raw message was not preserved:\n got: %q\nwant: %q", got, want)
	}
	if got, want := feature.Subject, "<script>alert(\"history\")</script> & 안녕 🌍"; got != want {
		t.Fatalf("subject = %q, want %q", got, want)
	}
	if got, want := feature.Author.Name, "Zoë 공격자 🚀"; got != want {
		t.Fatalf("author name = %q, want %q", got, want)
	}
	if got, want := feature.Committer.Name, "커미터 & Co."; got != want {
		t.Fatalf("committer name = %q, want %q", got, want)
	}
	assertTime(t, feature.Author.When, "2024-01-02T03:07:05+09:00")
	assertTime(t, feature.Committer.When, "2024-01-02T03:08:06+09:00")

	assertRef(t, commitByOID(t, snapshot, merge), "refs/heads/main", "main", history.RefLocalBranch, true)
	assertRef(t, feature, "refs/heads/feature", "feature", history.RefLocalBranch, false)
	assertRef(t, feature, "refs/tags/v-annotated", "v-annotated", history.RefTag, false)
	assertRef(t, commitByOID(t, snapshot, mainTip), "refs/remotes/origin/main", "origin/main", history.RefRemoteBranch, false)
	assertRef(t, commitByOID(t, snapshot, base), "refs/tags/v-lightweight", "v-lightweight", history.RefTag, false)
}

func TestLoaderSnapshotHandlesUnbornEmptyAndDetachedHEAD(t *testing.T) {
	t.Run("unborn empty repository", func(t *testing.T) {
		repository := newFixtureRepository(t, "sha1")
		loader := Loader{Runner: Runner{}}
		for _, scope := range []history.Scope{history.ScopeCurrent, history.ScopeAll} {
			snapshot := loadSnapshot(t, loader, repository.path, scope, 10)
			if snapshot.Repository.Head.Kind != history.HeadUnborn || snapshot.Repository.Head.Branch != "main" {
				t.Fatalf("HEAD = %#v, want unborn main", snapshot.Repository.Head)
			}
			if len(snapshot.Commits) != 0 || snapshot.Selection.Truncated {
				t.Fatalf("empty snapshot = %#v, want no commits and no truncation", snapshot)
			}
		}
	})

	t.Run("detached HEAD", func(t *testing.T) {
		repository := newFixtureRepository(t, "sha1")
		oid := repository.commit(fixedCommit("detached target", 0))
		repository.updateRef("refs/heads/main", oid)
		repository.git(nil, "update-ref", "--no-deref", "HEAD", oid)

		snapshot := loadSnapshot(t, Loader{Runner: Runner{}}, repository.path, history.ScopeCurrent, 10)
		if snapshot.Repository.Head.Kind != history.HeadDetached || snapshot.Repository.Head.OID == nil || string(*snapshot.Repository.Head.OID) != oid {
			t.Fatalf("HEAD = %#v, want detached at %s", snapshot.Repository.Head, oid)
		}
		if got, want := snapshotOIDs(snapshot), []string{oid}; !reflect.DeepEqual(got, want) {
			t.Fatalf("selected object IDs = %v, want %v", got, want)
		}
		assertRef(t, &snapshot.Commits[0], "HEAD", "HEAD", history.RefOther, true)
	})
}

func TestLoaderRejectsStoredButInvalidBranchHEAD(t *testing.T) {
	for _, test := range []struct {
		name string
		path func(repository *fixtureRepository) string
		data string
	}{
		{
			name: "loose ref",
			path: func(repository *fixtureRepository) string {
				return filepath.Join(repository.path, ".git", "refs", "heads", "main")
			},
			data: "not-an-object-id\n",
		},
		{
			name: "packed refs",
			path: func(repository *fixtureRepository) string {
				return filepath.Join(repository.path, ".git", "packed-refs")
			},
			data: "not-an-object refs/heads/main\n",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			repository := newFixtureRepository(t, "sha1")
			path := test.path(repository)
			if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(test.data), 0o600); err != nil {
				t.Fatal(err)
			}

			_, err := (Loader{Runner: Runner{}}).Discover(context.Background(), repository.path)
			var stateErr *StateError
			if !errors.As(err, &stateErr) {
				t.Fatalf("Discover() error = %T %v, want StateError", err, err)
			}
			if stateErr.Operation != "branch HEAD" && stateErr.Operation != "branch ref storage" {
				t.Fatalf("operation = %q, want branch state failure", stateErr.Operation)
			}
		})
	}
}

func TestLoaderSnapshotDistinguishesMaximumBoundaryFromTrueRoot(t *testing.T) {
	repository := newFixtureRepository(t, "sha1")
	root := repository.commit(fixedCommit("root", 0))
	middle := repository.commit(fixedCommit("middle", 1, root))
	tip := repository.commit(fixedCommit("tip", 2, middle))
	repository.updateRef("refs/heads/main", tip)

	loader := Loader{Runner: Runner{}}
	bounded := loadSnapshot(t, loader, repository.path, history.ScopeCurrent, 2)
	if !bounded.Selection.Truncated {
		t.Fatal("bounded selection did not report truncation")
	}
	if got, want := snapshotOIDs(bounded), repository.logOIDs(history.ScopeCurrent, 2); !reflect.DeepEqual(got, want) {
		t.Fatalf("bounded object IDs = %v, want %v", got, want)
	}
	if parent := commitByOID(t, bounded, middle).Parents; len(parent) != 1 || string(parent[0].OID) != root || parent[0].Visibility != history.ParentMaximumBoundary {
		t.Fatalf("middle parents = %#v, want maximum-count boundary at root", parent)
	}
	if parent := commitByOID(t, bounded, tip).Parents; len(parent) != 1 || parent[0].Visibility != history.ParentVisible {
		t.Fatalf("tip parents = %#v, want visible middle", parent)
	}

	complete := loadSnapshot(t, loader, repository.path, history.ScopeCurrent, 3)
	if complete.Selection.Truncated {
		t.Fatal("complete selection unexpectedly reported truncation")
	}
	if parents := commitByOID(t, complete, root).Parents; len(parents) != 0 {
		t.Fatalf("true root parents = %#v, want none", parents)
	}
}

func TestLoaderSnapshotHandlesDisconnectedHistories(t *testing.T) {
	repository := newFixtureRepository(t, "sha1")
	mainRoot := repository.commit(fixedCommit("main root", 0))
	mainTip := repository.commit(fixedCommit("main tip", 1, mainRoot))
	orphanRoot := repository.commit(fixedCommit("orphan root", 2))
	orphanTip := repository.commit(fixedCommit("orphan tip", 3, orphanRoot))
	repository.updateRef("refs/heads/main", mainTip)
	repository.updateRef("refs/heads/orphan", orphanTip)

	loader := Loader{Runner: Runner{}}
	all := loadSnapshot(t, loader, repository.path, history.ScopeAll, 10)
	if got, want := snapshotOIDs(all), repository.logOIDs(history.ScopeAll, 10); !reflect.DeepEqual(got, want) {
		t.Fatalf("all-ref object IDs = %v, want %v", got, want)
	}
	if commitByOID(t, all, orphanRoot) == nil {
		t.Fatal("all-ref history omitted disconnected orphan root")
	}

	current := loadSnapshot(t, loader, repository.path, history.ScopeCurrent, 10)
	if got, want := snapshotOIDs(current), repository.logOIDs(history.ScopeCurrent, 10); !reflect.DeepEqual(got, want) {
		t.Fatalf("current object IDs = %v, want %v", got, want)
	}
	for _, commit := range current.Commits {
		if string(commit.OID) == orphanRoot || string(commit.OID) == orphanTip {
			t.Fatalf("current history included disconnected orphan commit %s", commit.OID)
		}
	}
}

func TestLoaderSnapshotReportsTruncatedDisconnectedRoot(t *testing.T) {
	repository := newFixtureRepository(t, "sha1")
	first := repository.commit(fixedCommit("first root", 0))
	second := repository.commit(fixedCommit("second root", 1))
	repository.updateRef("refs/heads/main", first)
	repository.updateRef("refs/heads/other", second)

	snapshot := loadSnapshot(t, Loader{Runner: Runner{}}, repository.path, history.ScopeAll, 1)
	if !snapshot.Selection.Truncated {
		t.Fatal("selection omitted a disconnected root without reporting truncation")
	}
	if len(snapshot.Commits) != 1 || len(snapshot.Commits[0].Parents) != 0 {
		t.Fatalf("snapshot = %#v, want one true root", snapshot.Commits)
	}
}

func TestLoaderSnapshotPreservesOctopusParentOrder(t *testing.T) {
	repository := newFixtureRepository(t, "sha1")
	root := repository.commit(fixedCommit("root", 0))
	first := repository.commit(fixedCommit("first", 1, root))
	second := repository.commit(fixedCommit("second", 2, root))
	third := repository.commit(fixedCommit("third", 3, root))
	octopus := repository.commit(fixedCommit("octopus", 4, first, second, third))
	repository.updateRef("refs/heads/main", octopus)

	snapshot := loadSnapshot(t, Loader{Runner: Runner{}}, repository.path, history.ScopeCurrent, 10)
	if got, want := snapshotOIDs(snapshot), repository.logOIDs(history.ScopeCurrent, 10); !reflect.DeepEqual(got, want) {
		t.Fatalf("object IDs = %v, want %v", got, want)
	}
	parents := commitByOID(t, snapshot, octopus).Parents
	if len(parents) != 3 {
		t.Fatalf("octopus has %d parents, want 3", len(parents))
	}
	for index, want := range []string{first, second, third} {
		if string(parents[index].OID) != want || parents[index].Visibility != history.ParentVisible {
			t.Fatalf("parent %d = %#v, want visible %s", index, parents[index], want)
		}
	}
}

func TestLoaderSnapshotMarksShallowCloneBoundary(t *testing.T) {
	source := newFixtureRepository(t, "sha1")
	root := source.commit(fixedCommit("root", 0))
	middle := source.commit(fixedCommit("middle", 1, root))
	tip := source.commit(fixedCommit("tip", 2, middle))
	source.updateRef("refs/heads/main", tip)

	cloneParent := t.TempDir()
	clonePath := filepath.Join(cloneParent, "shallow")
	cloneEnvironment := isolatedGitEnvironment(t)
	if _, stderr, err := executeGit(cloneParent, cloneEnvironment, nil, "clone", "--depth=2", "file://"+source.path, clonePath); err != nil {
		t.Skipf("installed Git cannot create a local shallow clone: %v (%s)", err, strings.TrimSpace(string(stderr)))
	}
	clone := &fixtureRepository{t: t, path: clonePath, environment: cloneEnvironment}
	if got := strings.TrimSpace(string(clone.git(nil, "rev-parse", "--is-shallow-repository"))); got != "true" {
		t.Skipf("installed Git did not create a shallow clone (reported %q)", got)
	}

	snapshot := loadSnapshot(t, Loader{Runner: Runner{}}, clone.path, history.ScopeCurrent, 10)
	if got, want := snapshotOIDs(snapshot), clone.logOIDs(history.ScopeCurrent, 10); !reflect.DeepEqual(got, want) {
		t.Fatalf("shallow object IDs = %v, want %v", got, want)
	}
	boundary := commitByOID(t, snapshot, middle)
	if len(boundary.Parents) != 1 || string(boundary.Parents[0].OID) != root || boundary.Parents[0].Visibility != history.ParentShallowBoundary {
		t.Fatalf("shallow boundary parents = %#v, want shallow parent %s", boundary.Parents, root)
	}
	if snapshot.Selection.Truncated {
		t.Fatal("shallow repository was incorrectly reported as maximum-count truncated")
	}
	if len(snapshot.Warnings) != 1 || snapshot.Warnings[0].Code != history.WarningIncompleteHistory {
		t.Fatalf("warnings = %#v, want one incomplete-history warning", snapshot.Warnings)
	}
}

func TestLoaderSnapshotSupportsSHA256ObjectFormat(t *testing.T) {
	repository, stderr, err := tryNewFixtureRepository(t, "sha256")
	if err != nil {
		t.Skipf("installed Git does not support SHA-256 repositories: %v (%s)", err, strings.TrimSpace(stderr))
	}
	oid := repository.commit(fixedCommit("sha256 root", 0))
	repository.updateRef("refs/heads/main", oid)

	snapshot := loadSnapshot(t, Loader{Runner: Runner{}}, repository.path, history.ScopeAll, 10)
	if got, want := snapshotOIDs(snapshot), repository.logOIDs(history.ScopeAll, 10); !reflect.DeepEqual(got, want) {
		t.Fatalf("SHA-256 object IDs = %v, want %v", got, want)
	}
	if len(oid) != 64 || len(snapshot.Commits[0].OID) != 64 {
		t.Fatalf("object ID lengths = fixture %d, snapshot %d; want 64", len(oid), len(snapshot.Commits[0].OID))
	}
}

type fixtureRepository struct {
	t           *testing.T
	path        string
	environment []string
	tree        string
}

type commitSpec struct {
	Message        string
	Parents        []string
	AuthorName     string
	AuthorEmail    string
	AuthorDate     string
	CommitterName  string
	CommitterEmail string
	CommitterDate  string
}

func fixedCommit(message string, minute int, parents ...string) commitSpec {
	timestamp := "2024-01-02T03:" + fmt.Sprintf("%02d", minute) + ":00+09:00"
	return commitSpec{
		Message:        message,
		Parents:        parents,
		AuthorName:     "Fixture Author",
		AuthorEmail:    "author@example.test",
		AuthorDate:     timestamp,
		CommitterName:  "Fixture Committer",
		CommitterEmail: "committer@example.test",
		CommitterDate:  timestamp,
	}
}

func newFixtureRepository(t *testing.T, objectFormat string) *fixtureRepository {
	t.Helper()
	repository, stderr, err := tryNewFixtureRepository(t, objectFormat)
	if err != nil {
		t.Fatalf("initialize %s fixture repository: %v (%s)", objectFormat, err, strings.TrimSpace(stderr))
	}
	return repository
}

func tryNewFixtureRepository(t *testing.T, objectFormat string) (*fixtureRepository, string, error) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "repository")
	if err := os.Mkdir(path, 0o700); err != nil {
		return nil, "", err
	}
	environment := isolatedGitEnvironment(t)
	arguments := []string{"init", "--initial-branch=main"}
	if objectFormat != "" && objectFormat != "sha1" {
		arguments = append(arguments, "--object-format="+objectFormat)
	}
	_, stderr, err := executeGit(path, environment, nil, arguments...)
	if err != nil {
		return nil, string(stderr), err
	}
	repository := &fixtureRepository{t: t, path: path, environment: environment}
	repository.git(nil, "config", "--local", "user.name", "Fixture Tagger")
	repository.git(nil, "config", "--local", "user.email", "tagger@example.test")
	repository.tree = strings.TrimSpace(string(repository.git(nil, "mktree")))
	return repository, "", nil
}

func isolatedGitEnvironment(t *testing.T) []string {
	t.Helper()
	configurationRoot := t.TempDir()
	// Loader starts Git from the test process environment, while fixture setup
	// uses the explicit environment returned below. Isolate both paths so a
	// developer's global or system Git configuration cannot affect semantics.
	t.Setenv("HOME", configurationRoot)
	t.Setenv("XDG_CONFIG_HOME", configurationRoot)
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	t.Setenv("GIT_TERMINAL_PROMPT", "0")
	environment := make([]string, 0, len(os.Environ())+4)
	for _, entry := range os.Environ() {
		key, _, found := strings.Cut(entry, "=")
		if !found || strings.HasPrefix(key, "GIT_") || key == "HOME" || key == "XDG_CONFIG_HOME" {
			continue
		}
		environment = append(environment, entry)
	}
	return append(environment,
		"HOME="+configurationRoot,
		"XDG_CONFIG_HOME="+configurationRoot,
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_CONFIG_GLOBAL="+os.DevNull,
		"GIT_TERMINAL_PROMPT=0",
	)
}

func (repository *fixtureRepository) commit(spec commitSpec) string {
	repository.t.Helper()
	arguments := []string{"commit-tree", repository.tree}
	for _, parent := range spec.Parents {
		arguments = append(arguments, "-p", parent)
	}
	arguments = append(arguments, "-F", "-")
	environment := map[string]string{
		"GIT_AUTHOR_NAME":     spec.AuthorName,
		"GIT_AUTHOR_EMAIL":    spec.AuthorEmail,
		"GIT_AUTHOR_DATE":     spec.AuthorDate,
		"GIT_COMMITTER_NAME":  spec.CommitterName,
		"GIT_COMMITTER_EMAIL": spec.CommitterEmail,
		"GIT_COMMITTER_DATE":  spec.CommitterDate,
	}
	return strings.TrimSpace(string(repository.gitEnv(environment, []byte(spec.Message), arguments...)))
}

func (repository *fixtureRepository) updateRef(name, oid string) {
	repository.t.Helper()
	repository.git(nil, "update-ref", name, oid)
}

func (repository *fixtureRepository) logOIDs(scope history.Scope, maximum int) []string {
	repository.t.Helper()
	arguments := []string{
		"--no-pager", "log", "--topo-order", "--no-show-signature", "--no-color", "--no-decorate",
		"--encoding=UTF-8", "--max-count=" + strconv.Itoa(maximum), "--format=%H",
	}
	if scope == history.ScopeAll {
		arguments = append(arguments, "--all")
	} else {
		arguments = append(arguments, "HEAD")
	}
	output := strings.TrimSpace(string(repository.git(nil, arguments...)))
	if output == "" {
		return []string{}
	}
	return strings.Fields(output)
}

func (repository *fixtureRepository) git(input []byte, arguments ...string) []byte {
	repository.t.Helper()
	return repository.gitEnv(nil, input, arguments...)
}

func (repository *fixtureRepository) gitEnv(extra map[string]string, input []byte, arguments ...string) []byte {
	repository.t.Helper()
	environment := append([]string(nil), repository.environment...)
	for key, value := range extra {
		environment = append(environment, key+"="+value)
	}
	stdout, stderr, err := executeGit(repository.path, environment, input, arguments...)
	if err != nil {
		repository.t.Fatalf("git %s: %v\nstderr: %s", strings.Join(arguments, " "), err, stderr)
	}
	return stdout
}

func executeGit(directory string, environment []string, input []byte, arguments ...string) ([]byte, []byte, error) {
	command := exec.Command("git", arguments...)
	command.Dir = directory
	command.Env = environment
	command.Stdin = bytes.NewReader(input)
	var stdout, stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	err := command.Run()
	return stdout.Bytes(), stderr.Bytes(), err
}

func loadSnapshot(t *testing.T, loader Loader, path string, scope history.Scope, maximum int) history.Snapshot {
	t.Helper()
	snapshot, err := loader.Snapshot(context.Background(), path, scope, maximum)
	if err != nil {
		t.Fatalf("Snapshot(%s, %d): %v", scope, maximum, err)
	}
	return snapshot
}

func snapshotOIDs(snapshot history.Snapshot) []string {
	oids := make([]string, len(snapshot.Commits))
	for index, commit := range snapshot.Commits {
		oids[index] = string(commit.OID)
	}
	return oids
}

func commitByOID(t *testing.T, snapshot history.Snapshot, oid string) *history.Commit {
	t.Helper()
	for index := range snapshot.Commits {
		if string(snapshot.Commits[index].OID) == oid {
			return &snapshot.Commits[index]
		}
	}
	t.Fatalf("snapshot does not contain commit %s", oid)
	return nil
}

func assertRef(t *testing.T, commit *history.Commit, fullName, displayName string, kind history.RefKind, isHEAD bool) {
	t.Helper()
	for _, ref := range commit.Refs {
		if ref.FullName == fullName {
			if ref.DisplayName != displayName || ref.Kind != kind || ref.IsHEAD != isHEAD {
				t.Fatalf("ref %s = %#v, want display %q, kind %q, HEAD %t", fullName, ref, displayName, kind, isHEAD)
			}
			return
		}
	}
	t.Fatalf("commit %s does not have ref %s; refs = %#v", commit.OID, fullName, commit.Refs)
}

func assertTime(t *testing.T, got time.Time, wantText string) {
	t.Helper()
	want, err := time.Parse(time.RFC3339, wantText)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Equal(want) || got.Format(time.RFC3339) != wantText {
		t.Fatalf("timestamp = %s, want %s", got.Format(time.RFC3339), wantText)
	}
}
