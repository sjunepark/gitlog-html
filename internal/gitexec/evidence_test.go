package gitexec

import "testing"

func TestNeutralizeEvidenceNamesFormatAndControlRunesAndRepairsUTF8(t *testing.T) {
	got := neutralizeEvidence("before\u202e\u009bafter\n\t" + string([]byte{0xff}))
	if got != "before[U+202E][U+009B]after\n\t\uFFFD" {
		t.Fatalf("neutralizeEvidence() = %q", got)
	}
}

func TestEvidenceRunnerUsesDedicatedOutputCeiling(t *testing.T) {
	if got := evidenceRunner(Runner{}).MaxStdoutBytes; got != MaxEvidenceBytes {
		t.Fatalf("default MaxStdoutBytes = %d, want %d", got, MaxEvidenceBytes)
	}
	if got := evidenceRunner(Runner{MaxStdoutBytes: MaxEvidenceBytes + 1}).MaxStdoutBytes; got != MaxEvidenceBytes {
		t.Fatalf("large MaxStdoutBytes = %d, want %d", got, MaxEvidenceBytes)
	}
	if got := evidenceRunner(Runner{MaxStdoutBytes: 1024}).MaxStdoutBytes; got != 1024 {
		t.Fatalf("small MaxStdoutBytes = %d, want 1024", got)
	}
}
