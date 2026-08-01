package history

import (
	"strings"
	"testing"
)

func TestParseObjectIDIsLengthAgnostic(t *testing.T) {
	for _, value := range []string{"a", strings.Repeat("a", 40), strings.Repeat("b", 64)} {
		got, err := ParseObjectID(value)
		if err != nil {
			t.Fatalf("ParseObjectID(%q): %v", value, err)
		}
		if string(got) != value {
			t.Fatalf("ParseObjectID(%q) = %q", value, got)
		}
	}

	for _, value := range []string{"", "ABC", "not-an-object"} {
		if _, err := ParseObjectID(value); err == nil {
			t.Fatalf("ParseObjectID(%q) unexpectedly succeeded", value)
		}
	}
}

func TestExplanationPreservesNonblankText(t *testing.T) {
	if got := Explanation(" \n\t"); got != nil {
		t.Fatalf("blank explanation = %q, want nil", *got)
	}

	const value = "  설명 <script>alert(1)</script>  "
	got := Explanation(value)
	if got == nil || *got != value {
		t.Fatalf("Explanation() = %v, want exact input", got)
	}
}

func TestSubjectUsesFirstLogicalLine(t *testing.T) {
	const raw = "subject <b>\n\nbody\n"
	if got := Subject(raw); got != "subject <b>" {
		t.Fatalf("Subject() = %q", got)
	}
}
