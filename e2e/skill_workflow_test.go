package e2e_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"

	"github.com/sjunepark/gitlog-html/internal/report"
)

func TestInstalledSkillWorkflow(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("the local agent launcher uses a POSIX shell")
	}
	if _, err := exec.LookPath("git"); err != nil {
		t.Skipf("Git is unavailable: %v", err)
	}

	root := projectRoot(t)
	temporary := t.TempDir()
	developmentRoot := filepath.Join(temporary, "development-checkout")
	checkoutSkill := filepath.Join(developmentRoot, "skill", "gitlog-html")
	if err := os.CopyFS(checkoutSkill, os.DirFS(filepath.Join(root, "skill", "gitlog-html"))); err != nil {
		t.Fatalf("copy skill into development checkout: %v", err)
	}
	cli := filepath.Join(developmentRoot, "gitlog-html")
	run(t, root, nil, "go", "build", "-o", cli, "./cmd/gitlog-html")

	installed := filepath.Join(temporary, "codex-home", "skills", "gitlog-html")
	if err := os.MkdirAll(filepath.Dir(installed), 0o755); err != nil {
		t.Fatalf("create installed skill parent: %v", err)
	}
	if err := os.Symlink(checkoutSkill, installed); err != nil {
		t.Fatalf("install skill symlink: %v", err)
	}
	launcher := filepath.Join(installed, "scripts", "run-report.sh")

	repository, hostileOID, mergeOID := createHistoryFixture(t, temporary)

	t.Run("without explanations", func(t *testing.T) {
		output := filepath.Join(temporary, "without-explanations.html")
		pathEnvironment := environmentWith(os.Environ(), "PATH", developmentRoot+string(os.PathListSeparator)+os.Getenv("PATH"))
		run(t, root, pathEnvironment, launcher,
			"--",
			"--repo", repository,
			"--scope", "current",
			"--max-count", "2",
			"--output", output,
		)

		document := decodeReport(t, output)
		want := selectedOIDs(t, cli, repository, "current", 2, nil)
		assertSelectedOIDs(t, document, want)
		for _, commit := range document.Commits {
			if commit.Explanation != nil {
				t.Fatalf("commit %s unexpectedly has an explanation", commit.OID)
			}
		}
		assertStandalone(t, output)
	})

	t.Run("checkout-local CLI discovery", func(t *testing.T) {
		pathDirectory := filepath.Join(temporary, "fallback-path")
		if err := os.Mkdir(pathDirectory, 0o700); err != nil {
			t.Fatalf("create fallback PATH: %v", err)
		}
		for _, executable := range []string{"git", "dirname"} {
			resolved, err := exec.LookPath(executable)
			if err != nil {
				t.Fatalf("resolve %s: %v", executable, err)
			}
			if err := os.Symlink(resolved, filepath.Join(pathDirectory, executable)); err != nil {
				t.Fatalf("link %s into fallback PATH: %v", executable, err)
			}
		}
		output := filepath.Join(temporary, "checkout-local.html")
		pathEnvironment := environmentWith(os.Environ(), "PATH", pathDirectory)
		run(t, root, pathEnvironment, launcher,
			"--",
			"--repo", repository,
			"--scope", "current",
			"--max-count", "2",
			"--output", output,
		)
		assertStandalone(t, output)
	})

	t.Run("merge and hostile text with explanations", func(t *testing.T) {
		poisonedEnvironment := environmentWith(os.Environ(), "GIT_DIR", filepath.Join(root, ".git"))
		poisonedEnvironment = environmentWith(poisonedEnvironment, "GIT_WORK_TREE", root)
		descriptionDir := filepath.Join(temporary, "private-explanations")
		if err := os.Mkdir(descriptionDir, 0o700); err != nil {
			t.Fatalf("create explanation directory: %v", err)
		}
		descriptions := map[string]string{
			hostileOID: "Kept hostile-looking text inert while preserving the repository evidence.",
			mergeOID:   "Integrated the feature branch with the main line of development.",
		}
		descriptionData, err := json.Marshal(descriptions)
		if err != nil {
			t.Fatalf("encode descriptions: %v", err)
		}
		descriptionPath := filepath.Join(descriptionDir, "descriptions.json")
		if err := os.WriteFile(descriptionPath, descriptionData, 0o600); err != nil {
			t.Fatalf("write descriptions: %v", err)
		}

		output := filepath.Join(temporary, "with-explanations.html")
		run(t, root, poisonedEnvironment, launcher,
			"--cli", cli, "--",
			"--repo", repository,
			"--scope", "all",
			"--max-count", "10",
			"--descriptions", descriptionPath,
			"--output", output,
		)

		document := decodeReport(t, output)
		want := selectedOIDs(t, cli, repository, "all", 10, poisonedEnvironment)
		assertSelectedOIDs(t, document, want)
		byOID := make(map[string]report.Commit, len(document.Commits))
		for _, commit := range document.Commits {
			byOID[commit.OID] = commit
		}
		for oid, wantExplanation := range descriptions {
			commit, ok := byOID[oid]
			if !ok {
				t.Fatalf("described commit %s is not in the report", oid)
			}
			if commit.Explanation == nil || *commit.Explanation != wantExplanation {
				t.Fatalf("commit %s explanation = %v, want %q", oid, commit.Explanation, wantExplanation)
			}
		}
		if !strings.Contains(byOID[hostileOID].RawMessage, "</script><script>") ||
			!strings.Contains(byOID[hostileOID].RawMessage, "\u202e") ||
			!strings.Contains(byOID[hostileOID].RawMessage, "\u009b") {
			t.Fatalf("hostile commit text was not preserved: %q", byOID[hostileOID].RawMessage)
		}
		if len(byOID[mergeOID].Parents) != 2 {
			t.Fatalf("merge has %d parents, want 2", len(byOID[mergeOID].Parents))
		}
		evidenceOutput := run(t, root, poisonedEnvironment, cli,
			"inspect", "--repo", repository, "--scope", "all", "--max-count", "10", "--oid", hostileOID, "--patch",
		)
		var evidence struct {
			OID           string `json:"oid"`
			Evidence      string `json:"evidence"`
			PatchIncluded bool   `json:"patchIncluded"`
		}
		if err := json.Unmarshal([]byte(evidenceOutput), &evidence); err != nil {
			t.Fatalf("decode evidence output: %v\n%s", err, evidenceOutput)
		}
		if evidence.OID != hostileOID || !evidence.PatchIncluded || !strings.Contains(evidence.Evidence, "safe content") ||
			!strings.Contains(evidence.Evidence, "</script><script>") ||
			!strings.Contains(evidence.Evidence, "[U+202E]") ||
			!strings.Contains(evidence.Evidence, "[U+009B]") ||
			strings.ContainsRune(evidence.Evidence, '\u202e') ||
			strings.ContainsRune(evidence.Evidence, '\u009b') {
			t.Fatalf("safe evidence inspection = %#v", evidence)
		}
		assertStandalone(t, output)

		before, err := os.ReadFile(output)
		if err != nil {
			t.Fatalf("read report before collision check: %v", err)
		}
		result := runFailure(t, root, nil, launcher,
			"--cli", cli, "--", "--repo", repository, "--output", output,
		)
		if result.exitCode != 1 || !strings.Contains(result.stderr, "already exists") {
			t.Fatalf("collision result = exit %d, stderr %q", result.exitCode, result.stderr)
		}
		after, err := os.ReadFile(output)
		if err != nil {
			t.Fatalf("read report after collision check: %v", err)
		}
		if !bytes.Equal(before, after) {
			t.Fatal("collision failure changed the existing report")
		}
	})

	t.Run("missing explicit CLI is diagnostic", func(t *testing.T) {
		missing := filepath.Join(temporary, "missing", "gitlog-html")
		result := runFailure(t, root, nil, launcher, "--cli", missing, "--")
		if result.exitCode != 1 || !strings.Contains(result.stderr, "executable regular file") {
			t.Fatalf("missing CLI result = exit %d, stderr %q", result.exitCode, result.stderr)
		}
	})

	t.Run("missing Git is diagnostic", func(t *testing.T) {
		emptyPath := filepath.Join(temporary, "empty-path")
		if err := os.Mkdir(emptyPath, 0o755); err != nil {
			t.Fatalf("create empty PATH: %v", err)
		}
		result := runFailure(t, root, []string{"PATH=" + emptyPath}, launcher, "--cli", cli, "--")
		if result.exitCode != 1 || !strings.Contains(result.stderr, "Git is required") {
			t.Fatalf("missing Git result = exit %d, stderr %q", result.exitCode, result.stderr)
		}
	})
}

func createHistoryFixture(t *testing.T, parent string) (string, string, string) {
	t.Helper()
	repository := filepath.Join(parent, "history-fixture")
	if err := os.Mkdir(repository, 0o755); err != nil {
		t.Fatalf("create repository: %v", err)
	}
	run(t, repository, nil, "git", "init", "-b", "main")
	run(t, repository, nil, "git", "config", "user.name", "Skill Test")
	run(t, repository, nil, "git", "config", "user.email", "skill@example.test")

	writeAndCommit(t, repository, "history.txt", "root\n", "Create the history fixture")
	rootOID := strings.TrimSpace(run(t, repository, nil, "git", "rev-parse", "HEAD"))
	writeAndCommit(t, repository, "hostile.txt", "safe content\n", "Preserve </script><script> text \u202e and \u009b safely")
	hostileOID := strings.TrimSpace(run(t, repository, nil, "git", "rev-parse", "HEAD"))

	run(t, repository, nil, "git", "switch", "-c", "feature")
	writeAndCommit(t, repository, "feature.txt", "feature\n", "Add the feature line")
	run(t, repository, nil, "git", "switch", "main")
	writeAndCommit(t, repository, "main.txt", "main\n", "Advance the main line")
	run(t, repository, nil, "git", "merge", "--no-ff", "feature", "-m", "Merge feature integration")
	mergeOID := strings.TrimSpace(run(t, repository, nil, "git", "rev-parse", "HEAD"))
	run(t, repository, nil, "git", "branch", "linear", hostileOID)
	run(t, repository, nil, "git", "switch", "linear")
	run(t, repository, nil, "git", "replace", hostileOID, rootOID)
	return repository, hostileOID, mergeOID
}

func writeAndCommit(t *testing.T, repository, name, contents, message string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(repository, name), []byte(contents), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	run(t, repository, nil, "git", "add", "--", name)
	run(t, repository, nil, "git", "commit", "-m", message)
}

func selectedOIDs(t *testing.T, cli, repository, scope string, maximum int, environment []string) []string {
	t.Helper()
	output := run(t, repository, environment, cli,
		"inspect", "--repo", repository, "--scope", scope, "--max-count", fmt.Sprint(maximum),
	)
	var inspected struct {
		OIDs []string `json:"oids"`
	}
	if err := json.Unmarshal([]byte(output), &inspected); err != nil {
		t.Fatalf("decode selected object IDs: %v\n%s", err, output)
	}

	arguments := []string{
		"--no-replace-objects", "-C", repository, "--no-pager", "log", "--topo-order",
		"--no-show-signature", "--no-color", "--no-decorate", "--encoding=UTF-8",
		fmt.Sprintf("--max-count=%d", maximum), "--format=%H",
	}
	if scope == "all" {
		arguments = append(arguments, "--all")
	} else {
		arguments = append(arguments, "HEAD")
	}
	want := strings.Fields(run(t, repository, nil, "git", arguments...))
	if !slices.Equal(inspected.OIDs, want) {
		t.Fatalf("inspect object IDs = %v, reference Git = %v", inspected.OIDs, want)
	}
	return inspected.OIDs
}

func decodeReport(t *testing.T, path string) report.Document {
	t.Helper()
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read report: %v", err)
	}
	const startMarker = `<script id="gitlog-html-data" type="application/json"`
	start := bytes.Index(contents, []byte(startMarker))
	if start < 0 {
		t.Fatal("report data element is missing")
	}
	openEnd := bytes.Index(contents[start:], []byte(">"))
	if openEnd < 0 {
		t.Fatal("report data element start tag is not closed")
	}
	start += openEnd + 1
	end := bytes.Index(contents[start:], []byte("</script>"))
	if end < 0 {
		t.Fatal("report data element is not closed")
	}
	document, err := report.Decode(bytes.NewReader(contents[start : start+end]))
	if err != nil {
		t.Fatalf("decode report document: %v", err)
	}
	return document
}

func assertSelectedOIDs(t *testing.T, document report.Document, want []string) {
	t.Helper()
	got := make([]string, len(document.Commits))
	for index, commit := range document.Commits {
		got[index] = commit.OID
	}
	if !slices.Equal(got, want) {
		t.Fatalf("selected object IDs = %v, want %v", got, want)
	}
}

func assertStandalone(t *testing.T, path string) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat report: %v", err)
	}
	if !info.Mode().IsRegular() || info.Size() == 0 {
		t.Fatalf("report mode = %s, size = %d", info.Mode(), info.Size())
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read standalone report: %v", err)
	}
	lowered := strings.ToLower(string(contents))
	for _, forbidden := range []string{"<script src=", "<script async src=", "<link rel=\"stylesheet\"", "<link href=\""} {
		if strings.Contains(lowered, forbidden) {
			t.Fatalf("report contains external-resource form %q", forbidden)
		}
	}
	if !strings.Contains(lowered, "<style nonce=") || !strings.Contains(lowered, "id=\"gitlog-html-data\"") {
		t.Fatal("report does not contain its inline style and data")
	}
}

type failureResult struct {
	exitCode int
	stderr   string
}

func runFailure(t *testing.T, directory string, environment []string, name string, arguments ...string) failureResult {
	t.Helper()
	command := exec.Command(name, arguments...)
	command.Dir = directory
	if environment != nil {
		command.Env = environment
	}
	var stderr bytes.Buffer
	command.Stdout = &bytes.Buffer{}
	command.Stderr = &stderr
	err := command.Run()
	var exitError *exec.ExitError
	if !errors.As(err, &exitError) {
		t.Fatalf("run %s: got %v, want an exit error", name, err)
	}
	return failureResult{exitCode: exitError.ExitCode(), stderr: stderr.String()}
}

func run(t *testing.T, directory string, environment []string, name string, arguments ...string) string {
	t.Helper()
	command := exec.Command(name, arguments...)
	command.Dir = directory
	if environment != nil {
		command.Env = environment
	}
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run %s %v: %v\n%s", name, arguments, err, output)
	}
	return string(output)
}

func projectRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate test source")
	}
	return filepath.Dir(filepath.Dir(filename))
}

func environmentWith(environment []string, name, value string) []string {
	prefix := name + "="
	updated := make([]string, 0, len(environment)+1)
	for _, entry := range environment {
		if !strings.HasPrefix(entry, prefix) {
			updated = append(updated, entry)
		}
	}
	return append(updated, prefix+value)
}
