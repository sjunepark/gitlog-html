package report

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRenderProducesSafeStandaloneDocument(t *testing.T) {
	document := fixtureDocument(t)
	document.Repository.Name = "hostile </title><script>alert(\"title\")</script> & repo A\u202eBC\u202c Z"
	document.Commits[0].RawMessage += "\n</script><script>alert('data')</script>\u2028\u2029"
	document.Commits[0].Subject = strings.Split(document.Commits[0].RawMessage, "\n")[0]

	var output bytes.Buffer
	err := (Renderer{NonceSource: NonceFunc(func() (string, error) { return "fixed-nonce", nil })}).Render(&output, document)
	if err != nil {
		t.Fatalf("Render(): %v", err)
	}
	html := output.String()
	for _, want := range []string{
		`id="gitlog-html-app"`,
		`id="gitlog-html-data" type="application/json" nonce="fixed-nonce"`,
		`script-src 'nonce-fixed-nonce'`,
		`style-src 'nonce-fixed-nonce'`,
		`connect-src 'none'`,
		`hostile &lt;/title&gt;&lt;script&gt;alert(&#34;title&#34;)&lt;/script&gt; &amp; repo A[RLO]BC[PDF] Z — commit history`,
		`\u003c/script\u003e\u003cscript\u003ealert('data')\u003c/script\u003e\u2028\u2029`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("rendered document missing %q", want)
		}
	}
	if strings.Contains(html, `</title><script>alert("title")`) || strings.Contains(html, `</script><script>alert('data')`) {
		t.Fatal("dynamic content escaped its inert encoding")
	}
	if strings.Contains(strings.SplitN(html, "</title>", 2)[0], "\u202e") ||
		strings.Contains(strings.SplitN(html, "</title>", 2)[0], "\u202c") {
		t.Fatal("report title contains active bidirectional controls")
	}
	for _, forbidden := range []string{`<script src=`, `<link rel="stylesheet"`, `type="module"`, `sourceMappingURL=`} {
		if strings.Contains(html, forbidden) {
			t.Fatalf("rendered document contains forbidden runtime dependency %q", forbidden)
		}
	}
}

func TestNeutralizeBidiControlsNamesEveryFormattingCharacter(t *testing.T) {
	input := "\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069"
	want := "[ALM][LRM][RLM][LRE][RLE][PDF][LRO][RLO][LRI][RLI][FSI][PDI]"
	if got := neutralizeBidiControls(input); got != want {
		t.Fatalf("neutralizeBidiControls() = %q, want %q", got, want)
	}
	if got := neutralizeBidiControls("ordinary repository"); got != "ordinary repository" {
		t.Fatalf("neutralizeBidiControls() changed ordinary text to %q", got)
	}
}

func TestRenderNeutralizesEveryTitleBidiControl(t *testing.T) {
	document := fixtureDocument(t)
	document.Repository.Name = "A\u061c\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069Z"

	var output bytes.Buffer
	err := (Renderer{NonceSource: NonceFunc(func() (string, error) { return "fixed-nonce", nil })}).Render(&output, document)
	if err != nil {
		t.Fatalf("Render(): %v", err)
	}
	want := "<title>A[ALM][LRM][RLM][LRE][RLE][PDF][LRO][RLO][LRI][RLI][FSI][PDI]Z — commit history</title>"
	if !strings.Contains(output.String(), want) {
		t.Fatalf("rendered document missing neutral title %q", want)
	}
}

func TestContainsClosingElementRejectsUnsafeInlineSequences(t *testing.T) {
	tests := []struct {
		name     string
		contents string
		element  string
		want     bool
	}{
		{name: "closing script", contents: "const marker = '</ScRiPt>';", element: "script", want: true},
		{name: "closing style", contents: "/* </STYLE> */", element: "style", want: true},
		{name: "closed empty comment", contents: "const marker = '<!---->';", element: "script", want: false},
		{name: "script after closed comment", contents: "<!-- harmless --><script", element: "script", want: false},
		{name: "double escaped script", contents: "<!-- const marker = '<ScRiPt>';", element: "script", want: true},
		{name: "script marker irrelevant to style", contents: "<!-- <script", element: "style", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := containsClosingElement(test.contents, test.element); got != test.want {
				t.Fatalf("containsClosingElement(%q, %q) = %t, want %t", test.contents, test.element, got, test.want)
			}
		})
	}
}

func TestRenderRejectsInvalidNonce(t *testing.T) {
	document := fixtureDocument(t)
	err := (Renderer{NonceSource: NonceFunc(func() (string, error) { return `bad" nonce`, nil })}).Render(&bytes.Buffer{}, document)
	if err == nil || !strings.Contains(err.Error(), "invalid value") {
		t.Fatalf("Render() error = %v", err)
	}
}

func TestWriteFileProtectsTargetsAndCleansTemporary(t *testing.T) {
	directory := t.TempDir()
	output := filepath.Join(directory, "report.html")
	//nolint:gosec // The permissive fixture proves replacement takes the restrictive temporary-file mode.
	if err := os.WriteFile(output, []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}
	render := func(writer io.Writer) error {
		_, err := io.WriteString(writer, "replacement")
		return err
	}

	if _, err := WriteFile(output, false, nil, render); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("WriteFile(no force) error = %v", err)
	}
	if contents, _ := os.ReadFile(output); string(contents) != "original" {
		t.Fatalf("collision changed output to %q", contents)
	}
	resolved, err := WriteFile(output, true, nil, render)
	if err != nil {
		t.Fatalf("WriteFile(force): %v", err)
	}
	if !filepath.IsAbs(resolved) {
		t.Fatalf("resolved path = %q, want absolute", resolved)
	}
	if contents, _ := os.ReadFile(output); string(contents) != "replacement" {
		t.Fatalf("replacement output = %q", contents)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(output)
		if err != nil {
			t.Fatal(err)
		}
		if permissions := info.Mode().Perm(); permissions&0o077 != 0 {
			t.Fatalf("replacement output permissions = %o, want no group or other access", permissions)
		}
	}

	failure := errors.New("render stopped")
	failedOutput := filepath.Join(directory, "failed.html")
	if _, err := WriteFile(failedOutput, false, nil, func(writer io.Writer) error {
		_, _ = io.WriteString(writer, "partial")
		return failure
	}); !errors.Is(err, failure) {
		t.Fatalf("WriteFile(render failure) error = %v", err)
	}
	if _, err := os.Lstat(failedOutput); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failed output exists: %v", err)
	}

	if err := os.WriteFile(output, []byte("protected original"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := WriteFile(output, true, nil, func(writer io.Writer) error {
		closer, ok := writer.(io.Closer)
		if !ok {
			return errors.New("temporary writer is not closable")
		}
		if err := closer.Close(); err != nil {
			return err
		}
		_, err := io.WriteString(writer, "cannot be written")
		return err
	}); err == nil || !errors.Is(err, os.ErrClosed) {
		t.Fatalf("WriteFile(actual write failure) error = %v", err)
	}
	if contents, _ := os.ReadFile(output); string(contents) != "protected original" {
		t.Fatalf("failed write changed output to %q", contents)
	}
	matches, err := filepath.Glob(filepath.Join(directory, ".*.tmp-*"))
	if err != nil || len(matches) != 0 {
		t.Fatalf("temporary files after failure = %v, %v", matches, err)
	}
}

func TestWriteFileRefusesSymlinkDirectoryAndMissingParent(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "target.html")
	if err := os.WriteFile(target, []byte("target"), 0o600); err != nil {
		t.Fatal(err)
	}
	symlink := filepath.Join(directory, "link.html")
	if err := os.Symlink(target, symlink); err != nil {
		t.Fatal(err)
	}
	render := func(io.Writer) error { return nil }

	tests := []struct {
		name string
		path string
		want string
	}{
		{"symlink", symlink, "symbolic link"},
		{"directory", directory, "non-regular"},
		{"missing parent", filepath.Join(directory, "missing", "report.html"), "inspect parent"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := WriteFile(test.path, true, nil, render); err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("WriteFile() error = %v, want substring %q", err, test.want)
			}
		})
	}
	if contents, _ := os.ReadFile(target); string(contents) != "target" {
		t.Fatalf("symlink target changed to %q", contents)
	}
}

func TestWriteFileResolvesOutputParent(t *testing.T) {
	directory := t.TempDir()
	realParent := filepath.Join(directory, "reports")
	if err := os.Mkdir(realParent, 0o700); err != nil {
		t.Fatal(err)
	}
	linkedParent := filepath.Join(directory, "linked-reports")
	if err := os.Symlink(realParent, linkedParent); err != nil {
		t.Fatal(err)
	}

	resolved, err := WriteFile(filepath.Join(linkedParent, "report.html"), false, nil, func(writer io.Writer) error {
		_, err := io.WriteString(writer, "report")
		return err
	})
	if err != nil {
		t.Fatalf("WriteFile(): %v", err)
	}
	resolvedParent, err := filepath.EvalSymlinks(realParent)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(resolvedParent, "report.html")
	if resolved != want {
		t.Fatalf("resolved path = %q, want %q", resolved, want)
	}
}

func TestWriteFileRefusesProtectedPathsThroughResolvedParents(t *testing.T) {
	directory := t.TempDir()
	protected := filepath.Join(directory, "repository", ".git")
	if err := os.MkdirAll(protected, 0o700); err != nil {
		t.Fatal(err)
	}
	head := filepath.Join(protected, "HEAD")
	if err := os.WriteFile(head, []byte("ref: refs/heads/main\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	alias := filepath.Join(directory, "administrative-link")
	if err := os.Symlink(protected, alias); err != nil {
		t.Fatal(err)
	}

	_, err := WriteFile(filepath.Join(alias, "HEAD"), true, []string{protected}, func(writer io.Writer) error {
		_, writeErr := io.WriteString(writer, "replacement")
		return writeErr
	})
	if err == nil || !strings.Contains(err.Error(), "Git administrative storage") {
		t.Fatalf("WriteFile() error = %v, want administrative-storage refusal", err)
	}
	if contents, readErr := os.ReadFile(head); readErr != nil || string(contents) != "ref: refs/heads/main\n" {
		t.Fatalf("protected HEAD = %q, %v", contents, readErr)
	}
}

func TestWriteFileRefusesMissingReservedControlPath(t *testing.T) {
	directory := t.TempDir()
	protected := filepath.Join(directory, ".git")

	_, err := WriteFile(protected, false, []string{protected}, func(writer io.Writer) error {
		_, writeErr := io.WriteString(writer, "report")
		return writeErr
	})
	if err == nil || !strings.Contains(err.Error(), "Git administrative storage") {
		t.Fatalf("WriteFile() error = %v, want administrative-storage refusal", err)
	}
	if _, statErr := os.Lstat(protected); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("reserved control path was created: %v", statErr)
	}
}
