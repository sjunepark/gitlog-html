package gitexec

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"strings"
	"time"
)

const (
	DefaultMaxStdoutBytes = 64 * 1024 * 1024
	DefaultMaxStderrBytes = 64 * 1024
)

// Runner invokes the installed Git executable directly, without a shell.
// Zero-valued fields select the standard Git executable and output limits.
type Runner struct {
	Executable     string
	MaxStdoutBytes int
	MaxStderrBytes int
}

type Result struct {
	Stdout []byte
	Stderr []byte
}

// Run executes Git with args as distinct argument values in dir. Stdout is
// returned verbatim up to MaxStdoutBytes. Stderr is returned verbatim up to
// MaxStderrBytes and is sanitized separately before it is included in an
// error.
func (runner Runner) Run(ctx context.Context, dir string, args ...string) (Result, error) {
	executable := runner.Executable
	if executable == "" {
		executable = "git"
	}
	operation := commandOperation(args)
	if err := ctx.Err(); err != nil {
		return Result{}, &CancellationError{Operation: operation, Err: err}
	}

	stderrLimit := runner.MaxStderrBytes
	if stderrLimit <= 0 {
		stderrLimit = DefaultMaxStderrBytes
	}
	stdoutLimit := runner.MaxStdoutBytes
	if stdoutLimit <= 0 {
		stdoutLimit = DefaultMaxStdoutBytes
	}
	stdout := &limitedBuffer{maximum: stdoutLimit}
	stderr := &limitedBuffer{maximum: stderrLimit}

	command := exec.CommandContext(ctx, executable, args...)
	command.Dir = dir
	command.Env = gitEnvironment()
	command.Stdout = stdout
	command.Stderr = stderr
	// Git should not leave descendants holding output pipes because pagers and
	// hooks are disabled. This remains a final bound if a replaced executable
	// or platform-specific helper violates that assumption after cancellation.
	command.WaitDelay = time.Second

	runErr := command.Run()
	result := Result{
		Stdout: bytes.Clone(stdout.Bytes()),
		Stderr: bytes.Clone(stderr.Bytes()),
	}
	if runErr == nil {
		if stdout.Truncated() {
			return result, &OutputLimitError{Operation: operation, Limit: stdoutLimit}
		}
		return result, nil
	}

	displayStderr := safeStderr(result.Stderr)
	if isMissingExecutable(runErr, executable) {
		return result, &MissingExecutableError{Executable: executable, Err: runErr}
	}
	if contextErr := ctx.Err(); contextErr != nil {
		return result, &CancellationError{
			Operation:       operation,
			Stderr:          displayStderr,
			StderrTruncated: stderr.Truncated(),
			Err:             contextErr,
		}
	}
	var exitErr *exec.ExitError
	if errors.As(runErr, &exitErr) {
		return result, &ExitError{
			Operation:       operation,
			Code:            exitErr.ExitCode(),
			Stderr:          displayStderr,
			StderrTruncated: stderr.Truncated(),
			Err:             exitErr,
		}
	}
	return result, &ProcessError{
		Operation:       operation,
		Stderr:          displayStderr,
		StderrTruncated: stderr.Truncated(),
		Err:             runErr,
	}
}

type limitedBuffer struct {
	buffer    bytes.Buffer
	maximum   int
	truncated bool
}

func (buffer *limitedBuffer) Write(value []byte) (int, error) {
	originalLength := len(value)
	remaining := buffer.maximum - buffer.buffer.Len()
	if remaining > 0 {
		if len(value) > remaining {
			value = value[:remaining]
		}
		_, _ = buffer.buffer.Write(value)
	}
	if originalLength > remaining {
		buffer.truncated = true
	}
	return originalLength, nil
}

func (buffer *limitedBuffer) Bytes() []byte { return buffer.buffer.Bytes() }

func (buffer *limitedBuffer) Truncated() bool { return buffer.truncated }

func gitEnvironment() []string {
	overrides := map[string]string{
		"GIT_CONFIG_COUNT":    "3",
		"GIT_CONFIG_KEY_0":    "color.ui",
		"GIT_CONFIG_VALUE_0":  "false",
		"GIT_CONFIG_KEY_1":    "core.pager",
		"GIT_CONFIG_VALUE_1":  "cat",
		"GIT_CONFIG_KEY_2":    "core.hooksPath",
		"GIT_CONFIG_VALUE_2":  os.DevNull,
		"GIT_OPTIONAL_LOCKS":  "0",
		"GIT_PAGER":           "cat",
		"GIT_TERMINAL_PROMPT": "0",
		"NO_COLOR":            "1",
		"PAGER":               "cat",
	}

	environment := make([]string, 0, len(os.Environ())+len(overrides))
	for _, entry := range os.Environ() {
		key, _, found := strings.Cut(entry, "=")
		if !found || isUnsafeGitEnvironmentKey(key) {
			continue
		}
		for override := range overrides {
			if strings.EqualFold(key, override) {
				found = false
				break
			}
		}
		if !found {
			continue
		}
		environment = append(environment, entry)
	}
	for key, value := range overrides {
		environment = append(environment, key+"="+value)
	}
	return environment
}

func isUnsafeGitEnvironmentKey(key string) bool {
	upperKey := strings.ToUpper(key)
	if strings.HasPrefix(upperKey, "GIT_CONFIG_KEY_") ||
		strings.HasPrefix(upperKey, "GIT_CONFIG_VALUE_") ||
		strings.HasPrefix(upperKey, "GIT_TRACE") {
		return true
	}
	switch upperKey {
	case "GIT_ALTERNATE_OBJECT_DIRECTORIES",
		"GIT_COMMON_DIR",
		"GIT_CONFIG",
		"GIT_CONFIG_GLOBAL",
		"GIT_CONFIG_NOSYSTEM",
		"GIT_CONFIG_PARAMETERS",
		"GIT_CONFIG_SYSTEM",
		"GIT_DIR",
		"GIT_EXEC_PATH",
		"GIT_EXTERNAL_DIFF",
		"GIT_GRAFT_FILE",
		"GIT_IMPLICIT_WORK_TREE",
		"GIT_INDEX_FILE",
		"GIT_INTERNAL_SUPER_PREFIX",
		"GIT_NAMESPACE",
		"GIT_OBJECT_DIRECTORY",
		"GIT_PREFIX",
		"GIT_SHALLOW_FILE",
		"GIT_WORK_TREE":
		return true
	default:
		return false
	}
}

func isMissingExecutable(err error, executable string) bool {
	var lookupErr *exec.Error
	if errors.As(err, &lookupErr) && errors.Is(lookupErr.Err, exec.ErrNotFound) {
		return true
	}
	var pathErr *fs.PathError
	return errors.As(err, &pathErr) && pathErr.Path == executable && errors.Is(pathErr.Err, fs.ErrNotExist)
}

func commandOperation(args []string) string {
	if len(args) == 0 || args[0] == "" || len(args[0]) > 64 {
		return "command"
	}
	for _, character := range args[0] {
		if (character < 'a' || character > 'z') &&
			(character < 'A' || character > 'Z') &&
			(character < '0' || character > '9') &&
			character != '-' && character != '_' {
			return "command"
		}
	}
	return args[0]
}
