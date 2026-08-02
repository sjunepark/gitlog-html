package report

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"strings"
)

//go:embed assets/app.js
var applicationJavaScript string

//go:embed assets/app.css
var applicationCSS string

type Renderer struct {
	NonceSource NonceSource
}

// Render emits the complete offline document. Dynamic repository content has
// exactly two encodings: bidi-neutralized, escaped HTML in the title and
// HTML-safe JSON in the inert data element.
func (renderer Renderer) Render(writer io.Writer, document Document) error {
	if err := document.Validate(); err != nil {
		return fmt.Errorf("validate report document: %w", err)
	}
	if containsClosingElement(applicationCSS, "style") {
		return errors.New("embedded stylesheet contains a closing style element")
	}
	if containsClosingElement(applicationJavaScript, "script") {
		return errors.New("embedded application contains a closing script element")
	}

	nonceSource := renderer.NonceSource
	if nonceSource == nil {
		nonceSource = CryptoNonce{}
	}
	nonce, err := nonceSource.Nonce()
	if err != nil {
		return fmt.Errorf("create content-security-policy nonce: %w", err)
	}
	if !validNonce(nonce) {
		return errors.New("create content-security-policy nonce: source returned an invalid value")
	}
	data, err := json.Marshal(document)
	if err != nil {
		return fmt.Errorf("encode report data: %w", err)
	}

	policy := strings.Join([]string{
		"default-src 'none'",
		"script-src 'nonce-" + nonce + "'",
		"style-src 'nonce-" + nonce + "'",
		"img-src 'none'",
		"font-src 'none'",
		"connect-src 'none'",
		"frame-src 'none'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
	}, "; ")

	var output strings.Builder
	output.Grow(len(applicationJavaScript) + len(applicationCSS) + len(data) + 1024)
	output.WriteString("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n")
	output.WriteString("<meta http-equiv=\"Content-Security-Policy\" content=\"")
	output.WriteString(policy)
	output.WriteString("\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n")
	output.WriteString("<meta name=\"color-scheme\" content=\"light dark\">\n<title>")
	output.WriteString(html.EscapeString(neutralizeBidiControls(document.Repository.Name)))
	output.WriteString(" — commit history</title>\n<style nonce=\"")
	output.WriteString(nonce)
	output.WriteString("\">")
	output.WriteString(applicationCSS)
	output.WriteString("</style>\n</head>\n<body>\n<div id=\"gitlog-html-app\"></div>\n")
	output.WriteString("<noscript>This report is interactive and needs JavaScript to display the commit history.</noscript>\n")
	output.WriteString("<script id=\"gitlog-html-data\" type=\"application/json\" nonce=\"")
	output.WriteString(nonce)
	output.WriteString("\">")
	output.Write(data)
	output.WriteString("</script>\n<script nonce=\"")
	output.WriteString(nonce)
	output.WriteString("\">")
	output.WriteString(applicationJavaScript)
	output.WriteString("</script>\n</body>\n</html>\n")

	if _, err := io.WriteString(writer, output.String()); err != nil {
		return fmt.Errorf("write standalone report: %w", err)
	}
	return nil
}

var bidiControlReplacer = strings.NewReplacer(
	"\u061c", "[ALM]",
	"\u200e", "[LRM]",
	"\u200f", "[RLM]",
	"\u202a", "[LRE]",
	"\u202b", "[RLE]",
	"\u202c", "[PDF]",
	"\u202d", "[LRO]",
	"\u202e", "[RLO]",
	"\u2066", "[LRI]",
	"\u2067", "[RLI]",
	"\u2068", "[FSI]",
	"\u2069", "[PDI]",
)

// neutralizeBidiControls keeps a title derived from repository evidence while
// preventing an untrusted directional control from reordering the trusted
// suffix or browser chrome. The visible short names match the report UI.
func neutralizeBidiControls(text string) string {
	return bidiControlReplacer.Replace(text)
}

func containsClosingElement(contents, element string) bool {
	lowered := strings.ToLower(contents)
	if strings.Contains(lowered, "</"+element) {
		return true
	}
	if element != "script" {
		return false
	}

	for {
		comment := strings.Index(lowered, "<!--")
		if comment < 0 {
			return false
		}
		lowered = lowered[comment+len("<!--"):]
		commentEnd := strings.Index(lowered, "-->")
		script := strings.Index(lowered, "<script")
		if script >= 0 && (commentEnd < 0 || script < commentEnd) {
			return true
		}
		if commentEnd < 0 {
			return false
		}
		lowered = lowered[commentEnd+len("-->"):]
	}
}

func validNonce(nonce string) bool {
	if nonce == "" {
		return false
	}
	for _, character := range nonce {
		if (character < 'a' || character > 'z') &&
			(character < 'A' || character > 'Z') &&
			(character < '0' || character > '9') &&
			character != '-' && character != '_' {
			return false
		}
	}
	return true
}
