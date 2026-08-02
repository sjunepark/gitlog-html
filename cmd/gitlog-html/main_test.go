package main

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/sjunepark/gitlog-html/internal/generate"
	"github.com/sjunepark/gitlog-html/internal/gitexec"
	"github.com/sjunepark/gitlog-html/internal/history"
	"github.com/sjunepark/gitlog-html/internal/report"
)

type generatorFunc func(context.Context, generate.Request) (generate.Result, error)

func (function generatorFunc) Run(ctx context.Context, request generate.Request) (generate.Result, error) {
	return function(ctx, request)
}

func TestExecuteDefaultsAndSuccessDiagnostics(t *testing.T) {
	var received generate.Request
	service := generatorFunc(func(_ context.Context, request generate.Request) (generate.Result, error) {
		received = request
		return generate.Result{OutputPath: "/tmp/git-history.html", IncludedCount: 1, Warnings: []history.Warning{{Message: "reused input was ignored"}}}, nil
	})
	var stdout, stderr bytes.Buffer
	exit := execute(context.Background(), nil, &stdout, &stderr, service)
	if exit != 0 {
		t.Fatalf("execute() = %d, stderr = %s", exit, stderr.String())
	}
	if received.Repository != "." || received.Scope != history.ScopeAll || received.Maximum != 10 || received.OutputPath != "git-history.html" || received.Force {
		t.Fatalf("request = %#v", received)
	}
	if !strings.Contains(stdout.String(), `Wrote "/tmp/git-history.html" with 1 commit and 1 warning.`) {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if !strings.Contains(stderr.String(), "warning: reused input was ignored") || !strings.Contains(stderr.String(), "review it before sharing") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}

func TestExecuteExitCategories(t *testing.T) {
	tests := []struct {
		name      string
		arguments []string
		service   generator
		wantExit  int
		wantError string
	}{
		{"invalid scope", []string{"--scope", "nearby"}, generatorFunc(nil), 2, "unsupported history scope"},
		{"nonpositive limit", []string{"--max-count", "0"}, generatorFunc(nil), 2, "positive integer"},
		{"limit above safety ceiling", []string{"--max-count", "40001"}, generatorFunc(nil), 2, "must not exceed 40000"},
		{"positional", []string{"generate"}, generatorFunc(nil), 2, "unexpected positional"},
		{"single dash", []string{"-repo", "."}, generatorFunc(nil), 2, "--name form"},
		{"duplicate", []string{"--scope", "all", "--scope", "current"}, generatorFunc(nil), 2, "provided only once"},
		{"generation failure", nil, generatorFunc(func(context.Context, generate.Request) (generate.Result, error) {
			return generate.Result{}, errors.New("generation failed")
		}), 1, "generation failed"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			exit := execute(context.Background(), test.arguments, &stdout, &stderr, test.service)
			if exit != test.wantExit || !strings.Contains(stderr.String(), test.wantError) {
				t.Fatalf("execute() = %d, stderr = %q; want %d and %q", exit, stderr.String(), test.wantExit, test.wantError)
			}
		})
	}
}

func TestExecuteHelp(t *testing.T) {
	var stdout, stderr bytes.Buffer
	exit := execute(context.Background(), []string{"--help"}, &stdout, &stderr, generatorFunc(nil))
	if exit != 0 || !strings.Contains(stdout.String(), "Usage: gitlog-html") || stderr.Len() != 0 {
		t.Fatalf("execute(--help) = %d, stdout = %q, stderr = %q", exit, stdout.String(), stderr.String())
	}
}

func TestCommandContextHandlesTermination(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows does not deliver SIGTERM")
	}
	if os.Getenv("GITLOG_HTML_SIGNAL_HELPER") == "1" {
		ctx, stop := commandContext()
		defer stop()
		_, _ = fmt.Fprintln(os.Stdout, "ready")
		<-ctx.Done()
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestCommandContextHandlesTermination$")
	command.Env = append(os.Environ(), "GITLOG_HTML_SIGNAL_HELPER=1")
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	scanner := bufio.NewScanner(stdout)
	if !scanner.Scan() || scanner.Text() != "ready" {
		_ = command.Process.Kill()
		_ = command.Wait()
		t.Fatalf("signal helper did not become ready: %q, %v", scanner.Text(), scanner.Err())
	}
	if err := command.Process.Signal(syscall.SIGTERM); err != nil {
		_ = command.Process.Kill()
		_ = command.Wait()
		t.Fatal(err)
	}
	if err := command.Wait(); err != nil {
		t.Fatalf("signal helper did not exit cleanly: %v", err)
	}
	if ctx.Err() != nil {
		t.Fatalf("signal helper timed out: %v", ctx.Err())
	}
}

func TestParseOptionsAcceptsDashPrefixedValues(t *testing.T) {
	parsed, err := parseOptions([]string{"--repo", "-repository", "--output=-history.html", "--max-count", "7", "--scope", "current", "--force=false"})
	if err != nil {
		t.Fatalf("parseOptions(): %v", err)
	}
	if parsed.repository != "-repository" || parsed.outputPath != "-history.html" || parsed.maximum != 7 || parsed.scope != history.ScopeCurrent || parsed.force {
		t.Fatalf("options = %#v", parsed)
	}
}

func TestExecuteGeneratesRealStandaloneReport(t *testing.T) {
	repository := t.TempDir()
	runGit(t, repository, "init", "-b", "main")
	runGit(t, repository, "config", "user.name", "Test User")
	runGit(t, repository, "config", "user.email", "test@example.test")
	file := filepath.Join(repository, "story.txt")
	if err := os.WriteFile(file, []byte("first"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGit(t, repository, "add", "story.txt")
	runGit(t, repository, "commit", "-m", "first </script> & evidence")
	oid := strings.TrimSpace(runGit(t, repository, "rev-parse", "HEAD"))
	descriptionsPath := filepath.Join(repository, "descriptions.json")
	if err := os.WriteFile(descriptionsPath, []byte(`{"`+oid+`":"plain <img src=x onerror=alert(1)> explanation"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	outputPath := filepath.Join(t.TempDir(), "history.html")
	service := generate.Service{
		Loader:      gitexec.Loader{Runner: gitexec.Runner{}},
		Clock:       report.ClockFunc(func() time.Time { return time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC) }),
		NonceSource: report.NonceFunc(func() (string, error) { return "fixed-nonce", nil }),
		Generator:   report.Generator{Name: "gitlog-html", Version: "test"},
	}
	var stdout, stderr bytes.Buffer
	exit := execute(context.Background(), []string{
		"--repo", repository,
		"--descriptions", descriptionsPath,
		"--output", outputPath,
	}, &stdout, &stderr, service)
	if exit != 0 {
		t.Fatalf("execute() = %d, stderr = %s", exit, stderr.String())
	}
	contents, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	reportHTML := string(contents)
	for _, want := range []string{`<!doctype html>`, `id="gitlog-html-data"`, `"version":"test"`, `plain \u003cimg src=x onerror=alert(1)\u003e explanation`, `first \u003c/script\u003e \u0026 evidence`} {
		if !strings.Contains(reportHTML, want) {
			t.Fatalf("generated report missing %q", want)
		}
	}
	if strings.Contains(reportHTML, `<img src=x onerror=alert(1)>`) {
		t.Fatal("explanation became executable markup")
	}

	stdout.Reset()
	stderr.Reset()
	if exit := execute(context.Background(), []string{"--repo", repository, "--output", outputPath}, &stdout, &stderr, service); exit != 1 || !strings.Contains(stderr.String(), "already exists") {
		t.Fatalf("collision execute() = %d, stderr = %q", exit, stderr.String())
	}
	if exit := execute(context.Background(), []string{"--repo", repository, "--output", outputPath, "--force"}, &stdout, &stderr, service); exit != 0 {
		t.Fatalf("force execute() = %d, stderr = %q", exit, stderr.String())
	}
}

func TestExecuteRefusesRepositoryAdministrativeOutputsEvenWithForce(t *testing.T) {
	repository := t.TempDir()
	runGit(t, repository, "init", "-b", "main")
	runGit(t, repository, "config", "user.name", "Test User")
	runGit(t, repository, "config", "user.email", "test@example.test")
	runGit(t, repository, "commit", "--allow-empty", "-m", "root")
	linked := filepath.Join(t.TempDir(), "linked")
	runGit(t, repository, "worktree", "add", "-b", "linked", linked, "main")
	linkedGitDir := strings.TrimSpace(runGit(t, linked, "rev-parse", "--absolute-git-dir"))

	service := generate.Service{
		Loader:    gitexec.Loader{Runner: gitexec.Runner{}},
		Generator: report.Generator{Name: "gitlog-html", Version: "test"},
	}
	targets := []struct {
		name       string
		root       string
		outputPath string
	}{
		{name: "ordinary HEAD", root: repository, outputPath: filepath.Join(repository, ".git", "HEAD")},
		{name: "linked control file", root: linked, outputPath: filepath.Join(linked, ".git")},
		{name: "linked private HEAD", root: linked, outputPath: filepath.Join(linkedGitDir, "HEAD")},
		{name: "linked common HEAD", root: linked, outputPath: filepath.Join(repository, ".git", "HEAD")},
	}
	for _, target := range targets {
		t.Run(target.name, func(t *testing.T) {
			before, err := os.ReadFile(target.outputPath)
			if err != nil {
				t.Fatal(err)
			}
			var stdout, stderr bytes.Buffer
			exit := execute(context.Background(), []string{
				"--repo", target.root,
				"--output", target.outputPath,
				"--force",
			}, &stdout, &stderr, service)
			if exit != 1 || !strings.Contains(stderr.String(), "Git administrative storage") {
				t.Fatalf("execute() = %d, stderr = %q", exit, stderr.String())
			}
			after, err := os.ReadFile(target.outputPath)
			if err != nil || !bytes.Equal(after, before) {
				t.Fatalf("administrative target changed: equal=%t, read=%v", bytes.Equal(after, before), err)
			}
			if got := strings.TrimSpace(runGit(t, target.root, "rev-parse", "HEAD")); got == "" {
				t.Fatal("repository HEAD no longer resolves")
			}
		})
	}
}

func runGit(t *testing.T, directory string, arguments ...string) string {
	t.Helper()
	command := exec.Command("git", arguments...)
	command.Dir = directory
	command.Env = append(os.Environ(),
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_CONFIG_GLOBAL="+os.DevNull,
		"GIT_AUTHOR_DATE=2026-08-01T12:00:00Z",
		"GIT_COMMITTER_DATE=2026-08-01T12:00:00Z",
	)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(arguments, " "), err, output)
	}
	return string(output)
}
