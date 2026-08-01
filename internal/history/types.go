// Package history defines the repository-history domain independently of Git
// process output, report serialization, and browser presentation.
package history

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// ObjectID is an opaque, lowercase hexadecimal object name emitted by Git.
// Its length is intentionally unrestricted so SHA-1 and SHA-256 repositories
// share the same representation.
type ObjectID string

func ParseObjectID(value string) (ObjectID, error) {
	if value == "" {
		return "", errors.New("object ID is empty")
	}
	for _, r := range value {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return "", fmt.Errorf("object ID %q is not lowercase hexadecimal", value)
		}
	}
	return ObjectID(value), nil
}

func (id ObjectID) Validate() error {
	_, err := ParseObjectID(string(id))
	return err
}

type Scope string

const (
	ScopeAll     Scope = "all"
	ScopeCurrent Scope = "current"
)

func ParseScope(value string) (Scope, error) {
	switch Scope(value) {
	case ScopeAll, ScopeCurrent:
		return Scope(value), nil
	default:
		return "", fmt.Errorf("unsupported history scope %q", value)
	}
}

type HeadKind string

const (
	HeadBranch   HeadKind = "branch"
	HeadDetached HeadKind = "detached"
	HeadUnborn   HeadKind = "unborn"
)

// HeadState explicitly represents the states Git can expose. Branch is set
// for branch and unborn states; OID is set for branch and detached states.
type HeadState struct {
	Kind   HeadKind
	Branch string
	OID    *ObjectID
}

func (h HeadState) Validate() error {
	if !utf8.ValidString(h.Branch) {
		return errors.New("HEAD branch name is not valid UTF-8")
	}
	switch h.Kind {
	case HeadBranch:
		if h.Branch == "" || h.OID == nil {
			return errors.New("branch HEAD requires branch name and object ID")
		}
		if err := h.OID.Validate(); err != nil {
			return fmt.Errorf("branch HEAD object ID: %w", err)
		}
	case HeadDetached:
		if h.Branch != "" || h.OID == nil {
			return errors.New("detached HEAD requires only an object ID")
		}
		if err := h.OID.Validate(); err != nil {
			return fmt.Errorf("detached HEAD object ID: %w", err)
		}
	case HeadUnborn:
		if h.Branch == "" || h.OID != nil {
			return errors.New("unborn HEAD requires only a branch name")
		}
	default:
		return fmt.Errorf("unsupported HEAD kind %q", h.Kind)
	}
	return nil
}

type RefKind string

const (
	RefLocalBranch  RefKind = "local-branch"
	RefRemoteBranch RefKind = "remote-branch"
	RefTag          RefKind = "tag"
	RefOther        RefKind = "other"
)

type Ref struct {
	FullName    string
	DisplayName string
	Kind        RefKind
	IsHEAD      bool
}

func (ref Ref) Validate() error {
	if ref.FullName == "" || ref.DisplayName == "" {
		return errors.New("ref full and display names are required")
	}
	switch ref.Kind {
	case RefLocalBranch, RefRemoteBranch, RefTag, RefOther:
		return nil
	default:
		return fmt.Errorf("unsupported ref kind %q", ref.Kind)
	}
}

type Person struct {
	Name  string
	Email string
	When  time.Time
}

type ParentVisibility string

const (
	ParentVisible         ParentVisibility = "visible"
	ParentMaximumBoundary ParentVisibility = "maximum-count-boundary"
	ParentShallowBoundary ParentVisibility = "shallow-boundary"
)

type Parent struct {
	OID        ObjectID
	Visibility ParentVisibility
}

type Commit struct {
	OID            ObjectID
	AbbreviatedOID ObjectID
	Parents        []Parent
	Author         Person
	Committer      Person
	Subject        string
	RawMessage     string
	Explanation    *string
	Refs           []Ref
}

func (commit Commit) Validate() error {
	if err := commit.OID.Validate(); err != nil {
		return fmt.Errorf("commit object ID: %w", err)
	}
	if err := commit.AbbreviatedOID.Validate(); err != nil {
		return fmt.Errorf("abbreviated object ID: %w", err)
	}
	if !strings.HasPrefix(string(commit.OID), string(commit.AbbreviatedOID)) {
		return errors.New("abbreviated object ID is not a prefix of the full object ID")
	}
	if commit.Author.When.IsZero() || commit.Committer.When.IsZero() {
		return errors.New("author and committer timestamps are required")
	}
	if commit.Subject != Subject(commit.RawMessage) {
		return errors.New("commit subject does not match the first raw-message line")
	}
	if commit.Explanation != nil && strings.TrimSpace(*commit.Explanation) == "" {
		return errors.New("blank explanations must be absent")
	}
	for index, parent := range commit.Parents {
		if err := parent.OID.Validate(); err != nil {
			return fmt.Errorf("parent %d object ID: %w", index, err)
		}
		switch parent.Visibility {
		case ParentVisible, ParentMaximumBoundary, ParentShallowBoundary:
		default:
			return fmt.Errorf("parent %d has unsupported visibility %q", index, parent.Visibility)
		}
	}
	for index, ref := range commit.Refs {
		if err := ref.Validate(); err != nil {
			return fmt.Errorf("ref %d: %w", index, err)
		}
	}
	return nil
}

// Explanation returns nil for blank input while preserving nonblank text
// byte-for-byte for evidence and display.
func Explanation(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

// Subject derives the first logical line without modifying the raw message.
func Subject(rawMessage string) string {
	if index := strings.IndexByte(rawMessage, '\n'); index >= 0 {
		return rawMessage[:index]
	}
	return rawMessage
}

type Repository struct {
	Root        string
	DisplayName string
	Head        HeadState
}

type Selection struct {
	Scope     Scope
	Maximum   int
	Truncated bool
}

type WarningCode string

const (
	WarningDescriptionOutsideSlice WarningCode = "description-outside-slice"
	WarningIncompleteHistory       WarningCode = "incomplete-history"
)

type Warning struct {
	Code    WarningCode
	Message string
}

type Snapshot struct {
	Repository Repository
	Selection  Selection
	Commits    []Commit
	Warnings   []Warning
}
