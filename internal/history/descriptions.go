package history

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

// MaxDescriptionBytes bounds an agent-supplied input before it is retained in
// memory. The selected commit count bounds normal report work; this separate
// ceiling keeps a malformed input from bypassing that protection.
const MaxDescriptionBytes = 64 * 1024 * 1024

type Descriptions map[ObjectID]string

// DecodeDescriptions reads the strict, plain-text explanation map accepted by
// the CLI. A token walk is used instead of unmarshalling directly into a map so
// duplicate object IDs cannot be silently overwritten.
func DecodeDescriptions(reader io.Reader) (Descriptions, error) {
	return decodeDescriptions(reader, MaxDescriptionBytes)
}

func decodeDescriptions(reader io.Reader, maximum int) (Descriptions, error) {
	contents, err := io.ReadAll(io.LimitReader(reader, int64(maximum)+1))
	if err != nil {
		return nil, fmt.Errorf("read descriptions: %w", err)
	}
	if len(contents) > maximum {
		return nil, fmt.Errorf("descriptions exceed the %d-byte safety limit", maximum)
	}
	if !utf8.Valid(contents) {
		return nil, errors.New("descriptions are not valid UTF-8")
	}

	decoder := json.NewDecoder(bytes.NewReader(contents))
	opening, err := decoder.Token()
	if err != nil {
		return nil, fmt.Errorf("decode descriptions: %w", err)
	}
	if delimiter, ok := opening.(json.Delim); !ok || delimiter != '{' {
		return nil, errors.New("decode descriptions: top-level value must be an object")
	}

	descriptions := make(Descriptions)
	for decoder.More() {
		rawKey, err := decoder.Token()
		if err != nil {
			return nil, fmt.Errorf("decode description key: %w", err)
		}
		key, ok := rawKey.(string)
		if !ok {
			return nil, errors.New("decode descriptions: object key must be a string")
		}
		oid, err := ParseObjectID(key)
		if err != nil {
			return nil, fmt.Errorf("description key %q: %w", key, err)
		}
		if _, duplicate := descriptions[oid]; duplicate {
			return nil, fmt.Errorf("description key %q is duplicated", key)
		}
		var rawValue json.RawMessage
		if err := decoder.Decode(&rawValue); err != nil {
			return nil, fmt.Errorf("description %q must be a string: %w", key, err)
		}
		if len(rawValue) == 0 || rawValue[0] != '"' {
			return nil, fmt.Errorf("description %q must be a string", key)
		}
		var value string
		if err := json.Unmarshal(rawValue, &value); err != nil {
			return nil, fmt.Errorf("description %q must be a string: %w", key, err)
		}
		descriptions[oid] = value
	}
	if _, err := decoder.Token(); err != nil {
		return nil, fmt.Errorf("decode descriptions: %w", err)
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("decode descriptions: unexpected trailing JSON value")
		}
		return nil, fmt.Errorf("decode descriptions trailing data: %w", err)
	}
	return descriptions, nil
}

// AttachDescriptions returns an independently owned snapshot. Nonblank values
// attach only by exact full object ID; reusable superset entries become one
// deterministic warning rather than changing the selected history.
func AttachDescriptions(snapshot Snapshot, descriptions Descriptions) Snapshot {
	result := snapshot
	result.Commits = append([]Commit(nil), snapshot.Commits...)
	result.Warnings = append([]Warning(nil), snapshot.Warnings...)

	selected := make(map[ObjectID]struct{}, len(result.Commits))
	for index := range result.Commits {
		selected[result.Commits[index].OID] = struct{}{}
		if value, ok := descriptions[result.Commits[index].OID]; ok {
			result.Commits[index].Explanation = Explanation(value)
		}
	}

	unknownCount := 0
	for oid, value := range descriptions {
		if strings.TrimSpace(value) == "" {
			continue
		}
		if _, ok := selected[oid]; !ok {
			unknownCount++
		}
	}
	if unknownCount == 0 {
		return result
	}
	message := "Ignored 1 description for a commit outside the selected history."
	if unknownCount != 1 {
		message = fmt.Sprintf("Ignored %d descriptions for commits outside the selected history.", unknownCount)
	}
	result.Warnings = append(result.Warnings, Warning{
		Code:    WarningDescriptionOutsideSlice,
		Message: message,
	})
	return result
}
