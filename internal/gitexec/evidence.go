package gitexec

import (
	"context"
	"fmt"
	"strings"
	"unicode"

	"github.com/sjunepark/gitlog-html/internal/history"
)

// MaxEvidenceBytes is deliberately smaller than the generic Git transport
// ceiling because control naming and JSON serialization can expand the
// retained text before an agent consumes it.
const MaxEvidenceBytes = 4 * 1024 * 1024

// Evidence returns bounded, non-interactive Git evidence for one exact commit
// selected by the caller. Unicode format and non-layout control runes are named
// so repository text cannot reorder or control terminal or agent output.
func (loader Loader) Evidence(ctx context.Context, root string, oid history.ObjectID, includePatch bool) (string, error) {
	if err := oid.Validate(); err != nil {
		return "", fmt.Errorf("evidence object ID: %w", err)
	}
	arguments := []string{
		"--no-pager", "show", "--no-ext-diff", "--no-textconv", "--no-color",
		"--no-renames", "--encoding=UTF-8", "--parents", "--format=fuller", "--stat", "--summary",
	}
	if includePatch {
		arguments = append(arguments, "--patch")
	}
	arguments = append(arguments, string(oid), "--")
	runner := evidenceRunner(loader.Runner)
	result, err := runner.Run(ctx, root, arguments...)
	if err != nil {
		return "", err
	}
	return neutralizeEvidence(string(result.Stdout)), nil
}

func neutralizeEvidence(value string) string {
	value = strings.ToValidUTF8(value, "\uFFFD")
	var output strings.Builder
	output.Grow(len(value))
	for _, character := range value {
		if unicode.In(character, unicode.Cf) ||
			(unicode.IsControl(character) && character != '\n' && character != '\t') {
			_, _ = fmt.Fprintf(&output, "[U+%04X]", character)
			continue
		}
		output.WriteRune(character)
	}
	return output.String()
}

func evidenceRunner(runner Runner) Runner {
	if runner.MaxStdoutBytes <= 0 || runner.MaxStdoutBytes > MaxEvidenceBytes {
		runner.MaxStdoutBytes = MaxEvidenceBytes
	}
	return runner
}
