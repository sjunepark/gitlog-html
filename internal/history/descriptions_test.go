package history

import (
	"bytes"
	"strings"
	"testing"
)

func TestDecodeDescriptions(t *testing.T) {
	first := strings.Repeat("a", 40)
	second := strings.Repeat("b", 64)
	input := `{"` + first + `":  "preserved  \ntext","` + second + `":  "   "}`

	got, err := DecodeDescriptions(strings.NewReader(input))
	if err != nil {
		t.Fatalf("DecodeDescriptions(): %v", err)
	}
	if got[ObjectID(first)] != "preserved  \ntext" || got[ObjectID(second)] != "   " {
		t.Fatalf("DecodeDescriptions() = %#v", got)
	}
}

func TestDecodeDescriptionsRejectsInvalidInput(t *testing.T) {
	oid := strings.Repeat("a", 40)
	tests := []struct {
		name  string
		input []byte
		want  string
	}{
		{"invalid UTF-8", []byte{'{', '"', 'a', '"', ':', '"', 0xff, '"', '}'}, "not valid UTF-8"},
		{"array", []byte(`[]`), "top-level value must be an object"},
		{"invalid key", []byte(`{"ABC":"value"}`), "not lowercase hexadecimal"},
		{"duplicate key", []byte(`{"` + oid + `":"one","` + oid + `":"two"}`), "duplicated"},
		{"boolean value", []byte(`{"` + oid + `":true}`), "must be a string"},
		{"null value", []byte(`{"` + oid + `":null}`), "must be a string"},
		{"number value", []byte(`{"` + oid + `":1}`), "must be a string"},
		{"object value", []byte(`{"` + oid + `":{}}`), "must be a string"},
		{"array value", []byte(`{"` + oid + `":[]}`), "must be a string"},
		{"trailing value", []byte(`{"` + oid + `":"one"} []`), "trailing"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := DecodeDescriptions(bytes.NewReader(test.input))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("DecodeDescriptions() error = %v, want substring %q", err, test.want)
			}
		})
	}
}

func TestDecodeDescriptionsEnforcesSafetyLimit(t *testing.T) {
	_, err := decodeDescriptions(strings.NewReader("12345"), 4)
	if err == nil || !strings.Contains(err.Error(), "4-byte safety limit") {
		t.Fatalf("decodeDescriptions() error = %v", err)
	}
}

func TestDecodeDescriptionsDoesNotEchoTrailingControlText(t *testing.T) {
	oid := strings.Repeat("a", 40)
	_, err := DecodeDescriptions(strings.NewReader(`{"` + oid + `":"one"} "\u001b[2J\u202e"`))
	if err == nil || !strings.Contains(err.Error(), "unexpected trailing JSON value") {
		t.Fatalf("DecodeDescriptions() error = %v", err)
	}
	if strings.Contains(err.Error(), "\x1b") || strings.Contains(err.Error(), "\u202e") {
		t.Fatalf("DecodeDescriptions() echoed control text: %q", err)
	}
}

func TestAttachDescriptionsUsesExactIDsAndWarnsOnce(t *testing.T) {
	selected := ObjectID(strings.Repeat("a", 40))
	outside := ObjectID(strings.Repeat("b", 40))
	blankSelected := ObjectID(strings.Repeat("d", 40))
	prefix := ObjectID(strings.Repeat("a", 12))
	snapshot := Snapshot{Commits: []Commit{{OID: selected}, {OID: blankSelected}}}

	got := AttachDescriptions(snapshot, Descriptions{
		selected:                          "exact explanation",
		blankSelected:                     " \t",
		outside:                           "outside",
		prefix:                            "prefix must not attach",
		ObjectID(strings.Repeat("c", 40)): "  ",
	})

	if got.Commits[0].Explanation == nil || *got.Commits[0].Explanation != "exact explanation" {
		t.Fatalf("attached explanation = %#v", got.Commits[0].Explanation)
	}
	if got.Commits[1].Explanation != nil {
		t.Fatalf("blank explanation = %#v, want nil", got.Commits[1].Explanation)
	}
	if snapshot.Commits[0].Explanation != nil {
		t.Fatal("AttachDescriptions mutated the input snapshot")
	}
	if len(got.Warnings) != 1 || got.Warnings[0].Code != WarningDescriptionOutsideSlice || !strings.Contains(got.Warnings[0].Message, "2 descriptions") {
		t.Fatalf("warnings = %#v", got.Warnings)
	}
}
