package gitexec

import (
	"fmt"
	"strings"
	"unicode"
)

// MissingExecutableError reports that the configured Git executable could not
// be found. Executable is retained for programmatic diagnostics but is not
// included in Error so an unusual configured path cannot inject terminal text.
type MissingExecutableError struct {
	Executable string
	Err        error
}

func (err *MissingExecutableError) Error() string {
	return "Git executable is unavailable"
}

func (err *MissingExecutableError) Unwrap() error { return err.Err }

// ExitError reports a Git process that started and exited unsuccessfully.
// Stderr is sanitized for display and bounded according to Runner's limit.
type ExitError struct {
	Operation       string
	Code            int
	Stderr          string
	StderrTruncated bool
	Err             error
}

func (err *ExitError) Error() string {
	message := fmt.Sprintf("Git %s failed with exit code %d", err.Operation, err.Code)
	if err.Stderr != "" {
		message += ": " + err.Stderr
	}
	if err.StderrTruncated {
		message += " (stderr truncated)"
	}
	return message
}

func (err *ExitError) Unwrap() error { return err.Err }

// CancellationError reports that the caller canceled the operation or its
// deadline expired. It unwraps to context.Canceled or context.DeadlineExceeded.
type CancellationError struct {
	Operation       string
	Stderr          string
	StderrTruncated bool
	Err             error
}

func (err *CancellationError) Error() string {
	message := fmt.Sprintf("Git %s canceled: %v", err.Operation, err.Err)
	if err.Stderr != "" {
		message += ": " + err.Stderr
	}
	if err.StderrTruncated {
		message += " (stderr truncated)"
	}
	return message
}

func (err *CancellationError) Unwrap() error { return err.Err }

// ProcessError reports a process start or wait failure not represented by one
// of the more specific error types.
type ProcessError struct {
	Operation       string
	Stderr          string
	StderrTruncated bool
	Err             error
}

func (err *ProcessError) Error() string {
	message := fmt.Sprintf("Git %s could not run", err.Operation)
	if err.Stderr != "" {
		message += ": " + err.Stderr
	}
	if err.StderrTruncated {
		message += " (stderr truncated)"
	}
	return message
}

func (err *ProcessError) Unwrap() error { return err.Err }

// OutputLimitError reports a Git operation whose stdout exceeded Runner's
// safety ceiling. The runner stops the process once the ceiling is crossed.
// The retained Result contains only the bounded prefix and must not be parsed
// as complete output.
type OutputLimitError struct {
	Operation string
	Limit     int
}

func (err *OutputLimitError) Error() string {
	return fmt.Sprintf("Git %s output exceeded the %d-byte safety limit", err.Operation, err.Limit)
}

func safeStderr(stderr []byte) string {
	text := strings.ToValidUTF8(string(stderr), "\uFFFD")
	text = strings.Map(func(character rune) rune {
		switch character {
		case '\n':
			return character
		case '\r', '\t':
			return ' '
		default:
			if unicode.IsControl(character) || unicode.In(character, unicode.Cf) {
				return '\uFFFD'
			}
			return character
		}
	}, text)
	return strings.TrimSpace(text)
}
