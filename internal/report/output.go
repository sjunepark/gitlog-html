package report

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

type OutputError struct {
	Operation string
	Path      string
	Err       error
}

func (err *OutputError) Error() string {
	return fmt.Sprintf("%s output %q: %v", err.Operation, err.Path, err.Err)
}

func (err *OutputError) Unwrap() error { return err.Err }

// WriteFile renders through a restrictive sibling temporary and installs it
// only after a complete write, flush, close, and final target safety check.
// The final same-directory rename is atomic on Unix-like systems; Go does not
// expose a portable atomic-rename guarantee on every supported platform.
func WriteFile(path string, force bool, render func(io.Writer) error) (resolved string, err error) {
	resolved, err = filepath.Abs(path)
	if err != nil {
		return "", &OutputError{Operation: "resolve", Path: path, Err: err}
	}
	resolved = filepath.Clean(resolved)
	parent, err := filepath.EvalSymlinks(filepath.Dir(resolved))
	if err != nil {
		return "", &OutputError{Operation: "inspect parent for", Path: resolved, Err: err}
	}
	resolved = filepath.Join(parent, filepath.Base(resolved))

	initial, err := inspectOutput(resolved, force)
	if err != nil {
		return "", err
	}
	parentInfo, err := os.Stat(parent)
	if err != nil {
		return "", &OutputError{Operation: "inspect parent for", Path: resolved, Err: err}
	}
	if !parentInfo.IsDir() {
		return "", &OutputError{Operation: "inspect parent for", Path: resolved, Err: errors.New("parent is not a directory")}
	}

	temporary, err := os.CreateTemp(parent, "."+filepath.Base(resolved)+".tmp-*")
	if err != nil {
		return "", &OutputError{Operation: "create temporary", Path: resolved, Err: err}
	}
	temporaryPath := temporary.Name()
	defer func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
	}()

	if err := temporary.Chmod(0o600); err != nil {
		return "", &OutputError{Operation: "secure temporary for", Path: resolved, Err: err}
	}
	if err := render(temporary); err != nil {
		return "", &OutputError{Operation: "render", Path: resolved, Err: err}
	}
	if err := temporary.Sync(); err != nil {
		return "", &OutputError{Operation: "flush", Path: resolved, Err: err}
	}
	if err := temporary.Close(); err != nil {
		return "", &OutputError{Operation: "close temporary for", Path: resolved, Err: err}
	}
	if err := recheckOutput(resolved, force, initial); err != nil {
		return "", err
	}
	if err := os.Rename(temporaryPath, resolved); err != nil {
		return "", &OutputError{Operation: "install", Path: resolved, Err: err}
	}
	return resolved, nil
}

func inspectOutput(path string, force bool) (fs.FileInfo, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, &OutputError{Operation: "inspect", Path: path, Err: err}
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil, &OutputError{Operation: "inspect", Path: path, Err: errors.New("refusing a symbolic link")}
	}
	if !info.Mode().IsRegular() {
		return nil, &OutputError{Operation: "inspect", Path: path, Err: errors.New("refusing a non-regular file")}
	}
	if !force {
		return nil, &OutputError{Operation: "inspect", Path: path, Err: errors.New("file already exists; use --force to replace it")}
	}
	return info, nil
}

func recheckOutput(path string, force bool, initial fs.FileInfo) error {
	current, err := os.Lstat(path)
	if initial == nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return &OutputError{Operation: "recheck", Path: path, Err: err}
		}
		return &OutputError{Operation: "recheck", Path: path, Err: errors.New("target appeared while the report was being written")}
	}
	if err != nil {
		return &OutputError{Operation: "recheck", Path: path, Err: fmt.Errorf("target changed while the report was being written: %w", err)}
	}
	if !force || current.Mode()&os.ModeSymlink != 0 || !current.Mode().IsRegular() || !os.SameFile(initial, current) {
		return &OutputError{Operation: "recheck", Path: path, Err: errors.New("target changed while the report was being written")}
	}
	return nil
}
