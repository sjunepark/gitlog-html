package gitexec

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestRunnerInvokesInstalledGit(t *testing.T) {
	result, err := (Runner{}).Run(context.Background(), "", "--version")
	if err != nil {
		t.Fatalf("Run(git --version): %v", err)
	}
	if !strings.HasPrefix(string(result.Stdout), "git version ") {
		t.Fatalf("stdout = %q, want Git version", result.Stdout)
	}
}

func TestRunnerPreservesArgumentsOutputDirectoryAndSafeEnvironment(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "repository with spaces")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("GO_WANT_GITEXEC_HELPER", "1")
	t.Setenv("GIT_OPTIONAL_LOCKS", "1")
	t.Setenv("GIT_PAGER", "less --RAW-CONTROL-CHARS")
	t.Setenv("GIT_CONFIG_COUNT", "99")
	t.Setenv("GIT_CONFIG_PARAMETERS", "'credential.helper'='should-not-survive'")
	t.Setenv("GIT_CONFIG_KEY_99", "credential.helper")
	t.Setenv("GIT_CONFIG_VALUE_99", "should-not-survive")
	t.Setenv("GIT_DIR", filepath.Join(t.TempDir(), "wrong-repository"))
	t.Setenv("git_work_tree", filepath.Join(t.TempDir(), "wrong-worktree"))
	t.Setenv("GIT_TRACE", "1")
	for _, key := range []string{
		"GIT_ASKPASS",
		"GIT_CEILING_DIRECTORIES",
		"GIT_EDITOR",
		"GIT_SEQUENCE_EDITOR",
		"GIT_SSH",
		"GIT_SSH_COMMAND",
		"SSH_ASKPASS",
	} {
		t.Setenv(key, "must-not-survive")
	}
	t.Setenv("UNRELATED_ENVIRONMENT_KEY", "safe-value")

	arguments := []string{
		"-test.run=^TestGitExecHelperProcess$",
		"--",
		"inspect",
		"value with spaces",
		"$(touch should-not-exist); echo unsafe",
	}
	result, err := (Runner{Executable: os.Args[0]}).Run(context.Background(), directory, arguments...)
	if err != nil {
		t.Fatalf("Run(): %v", err)
	}
	if got, want := string(result.Stderr), "diagnostic bytes"; got != want {
		t.Fatalf("stderr = %q, want %q", got, want)
	}
	resolvedDirectory, err := filepath.EvalSymlinks(directory)
	if err != nil {
		t.Fatalf("resolve test directory: %v", err)
	}

	fields := strings.Split(string(result.Stdout), "\x00")
	want := []string{
		resolvedDirectory,
		"value with spaces",
		"$(touch should-not-exist); echo unsafe",
		"GIT_OPTIONAL_LOCKS=0",
		"GIT_PAGER=cat",
		"GIT_TERMINAL_PROMPT=0",
		"NO_COLOR=1",
		"PAGER=cat",
		"GIT_CONFIG_COUNT=3",
		"GIT_CONFIG_PARAMETERS=",
		"GIT_CONFIG_KEY_0=color.ui",
		"GIT_CONFIG_VALUE_0=false",
		"GIT_CONFIG_KEY_1=core.pager",
		"GIT_CONFIG_VALUE_1=cat",
		"GIT_CONFIG_KEY_2=core.hooksPath",
		"GIT_CONFIG_VALUE_2=" + os.DevNull,
		"GIT_CONFIG_KEY_99=",
		"GIT_CONFIG_VALUE_99=",
		"GIT_DIR=",
		"git_work_tree=",
		"GIT_TRACE=",
		"GIT_ASKPASS=",
		"GIT_CEILING_DIRECTORIES=",
		"GIT_EDITOR=",
		"GIT_SEQUENCE_EDITOR=",
		"GIT_SSH=",
		"GIT_SSH_COMMAND=",
		"SSH_ASKPASS=",
		"UNRELATED_ENVIRONMENT_KEY=safe-value",
	}
	if len(fields) > 0 && fields[len(fields)-1] == "" {
		fields = fields[:len(fields)-1]
	}
	if !slices.Equal(fields, want) {
		t.Fatalf("helper fields:\n got: %q\nwant: %q", fields, want)
	}
	if _, err := os.Stat(filepath.Join(directory, "should-not-exist")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("argument was interpreted by a shell: %v", err)
	}
}

func TestRunnerReturnsTypedMissingExecutableError(t *testing.T) {
	executable := filepath.Join(t.TempDir(), "missing-git")
	_, err := (Runner{Executable: executable}).Run(context.Background(), "", "version")
	var missingErr *MissingExecutableError
	if !errors.As(err, &missingErr) {
		t.Fatalf("Run() error = %T %v, want MissingExecutableError", err, err)
	}
	if missingErr.Executable != executable {
		t.Fatalf("Executable = %q, want %q", missingErr.Executable, executable)
	}
}

func TestRunnerReturnsBoundedSafeExitErrorAndPartialOutput(t *testing.T) {
	t.Setenv("GO_WANT_GITEXEC_HELPER", "1")
	t.Setenv("TOP_SECRET_VALUE", "must-not-appear")
	result, err := (Runner{Executable: os.Args[0], MaxStderrBytes: 12}).Run(
		context.Background(),
		"",
		"-test.run=^TestGitExecHelperProcess$",
		"--",
		"fail",
	)
	if got, want := string(result.Stdout), "partial output"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got, want := string(result.Stderr), "failure:\x1b[31"; got != want {
		t.Fatalf("stderr = %q, want bounded %q", got, want)
	}

	var exitErr *ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("Run() error = %T %v, want ExitError", err, err)
	}
	if exitErr.Code != 23 || !exitErr.StderrTruncated {
		t.Fatalf("ExitError = %#v, want code 23 and truncated stderr", exitErr)
	}
	if strings.Contains(exitErr.Stderr, "\x1b") || strings.Contains(err.Error(), "TOP_SECRET_VALUE") {
		t.Fatalf("unsafe exit error: %#v / %q", exitErr, err)
	}
}

func TestRunnerReturnsTypedErrorForOversizedStdout(t *testing.T) {
	t.Setenv("GO_WANT_GITEXEC_HELPER", "1")
	result, err := (Runner{Executable: os.Args[0], MaxStdoutBytes: 12}).Run(
		context.Background(),
		"",
		"-test.run=^TestGitExecHelperProcess$",
		"--",
		"large",
	)
	if got, want := string(result.Stdout), "abcdefghijkl"; got != want {
		t.Fatalf("stdout = %q, want bounded %q", got, want)
	}
	var limitErr *OutputLimitError
	if !errors.As(err, &limitErr) {
		t.Fatalf("Run() error = %T %v, want OutputLimitError", err, err)
	}
	if limitErr.Operation != "command" || limitErr.Limit != 12 {
		t.Fatalf("OutputLimitError = %#v", limitErr)
	}
}

func TestRunnerReturnsTypedCancellationError(t *testing.T) {
	t.Setenv("GO_WANT_GITEXEC_HELPER", "1")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()

	_, err := (Runner{Executable: os.Args[0]}).Run(
		ctx,
		"",
		"-test.run=^TestGitExecHelperProcess$",
		"--",
		"block",
	)
	var cancellationErr *CancellationError
	if !errors.As(err, &cancellationErr) {
		t.Fatalf("Run() error = %T %v, want CancellationError", err, err)
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Run() error = %v, want context deadline cause", err)
	}
}

func TestRunnerDoesNotStartWithCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := (Runner{Executable: filepath.Join(t.TempDir(), "also-missing")}).Run(ctx, "", "version")
	var cancellationErr *CancellationError
	if !errors.As(err, &cancellationErr) || !errors.Is(err, context.Canceled) {
		t.Fatalf("Run() error = %T %v, want canceled CancellationError", err, err)
	}
}

func TestGitExecHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_GITEXEC_HELPER") != "1" {
		return
	}
	marker := -1
	for index, argument := range os.Args {
		if argument == "--" {
			marker = index
			break
		}
	}
	if marker < 0 || marker+1 >= len(os.Args) {
		os.Exit(97)
	}

	switch os.Args[marker+1] {
	case "inspect":
		directory, err := os.Getwd()
		if err != nil {
			os.Exit(96)
		}
		writeNULTerminated(directory)
		for _, argument := range os.Args[marker+2:] {
			writeNULTerminated(argument)
		}
		for _, key := range []string{
			"GIT_OPTIONAL_LOCKS",
			"GIT_PAGER",
			"GIT_TERMINAL_PROMPT",
			"NO_COLOR",
			"PAGER",
			"GIT_CONFIG_COUNT",
			"GIT_CONFIG_PARAMETERS",
			"GIT_CONFIG_KEY_0",
			"GIT_CONFIG_VALUE_0",
			"GIT_CONFIG_KEY_1",
			"GIT_CONFIG_VALUE_1",
			"GIT_CONFIG_KEY_2",
			"GIT_CONFIG_VALUE_2",
			"GIT_CONFIG_KEY_99",
			"GIT_CONFIG_VALUE_99",
			"GIT_DIR",
			"git_work_tree",
			"GIT_TRACE",
			"GIT_ASKPASS",
			"GIT_CEILING_DIRECTORIES",
			"GIT_EDITOR",
			"GIT_SEQUENCE_EDITOR",
			"GIT_SSH",
			"GIT_SSH_COMMAND",
			"SSH_ASKPASS",
			"UNRELATED_ENVIRONMENT_KEY",
		} {
			writeNULTerminated(key + "=" + os.Getenv(key))
		}
		_, _ = os.Stderr.WriteString("diagnostic bytes")
		os.Exit(0)
	case "fail":
		_, _ = os.Stdout.WriteString("partial output")
		_, _ = os.Stderr.Write([]byte("failure:\x1b[31m and more stderr"))
		os.Exit(23)
	case "block":
		time.Sleep(10 * time.Second)
		os.Exit(0)
	case "large":
		_, _ = os.Stdout.WriteString("abcdefghijklmnopqrstuvwxyz")
		os.Exit(0)
	default:
		os.Exit(95)
	}
}

func TestSafeStderrRemovesTerminalAndUnicodeFormatControls(t *testing.T) {
	got := safeStderr([]byte("danger\x1b[31m\u202ereversed\rtext"))
	if strings.ContainsAny(got, "\x1b\r") || strings.ContainsRune(got, '\u202e') {
		t.Fatalf("safeStderr() retained control text: %q", got)
	}
	if !strings.Contains(got, "danger") || !strings.Contains(got, "reversed text") {
		t.Fatalf("safeStderr() lost useful context: %q", got)
	}
}

func writeNULTerminated(value string) {
	_, _ = os.Stdout.WriteString(value)
	_, _ = os.Stdout.Write([]byte{0})
}
