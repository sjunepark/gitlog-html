# Standalone Report Format

## Artifact contract

Every invocation produces one UTF-8 HTML document that can be copied, renamed,
attached, archived, and opened directly through a file URL. The document
contains all data, style, and executable code required for viewing.

The output must not contain:

- external script, stylesheet, image, or font URLs;
- module imports or dynamically loaded chunks;
- fetch, XMLHttpRequest, WebSocket, or service-worker behavior;
- paths back to the source repository or explanation file;
- source maps;
- executable text derived from a commit or explanation.

## Document structure

The generated file has this conceptual structure:

    <!doctype html>
    <html>
      <head>
        metadata
        restrictive content-security policy
        inlined compiled CSS
      </head>
      <body>
        application mount point
        no-script explanation
        inlined versioned report JSON
        inlined compiled Svelte IIFE
      </body>
    </html>

The JavaScript is a classic inlined IIFE rather than an ES module so direct
file viewing does not depend on module-origin behavior. Svelte mounts on the
single application root; hydration and server rendering are not used.

## Embedded report model

The Go model is canonical. TypeScript mirrors it for the UI and both sides
share golden fixtures.

Top-level fields:

- schemaVersion: integer document-data contract version, initially 1.
- generator: generator name and build version when available.
- generatedAt: ISO timestamp for report generation.
- repository: display name and typed HEAD state.
- selection: scope, maximum count, included count, and truncation state.
- commits: ordered commit records.
- graph: logical lane layout aligned one-to-one with commits.
- warnings: truthful limitations the reader may need to know.

A commit record contains:

- oid and abbreviatedOid;
- ordered parent object IDs and their visibility status;
- author and committer name, email, and ISO timestamp;
- subject and complete rawMessage;
- optional explanation;
- refs with full name, display name, kind, and HEAD status.

The graph contains:

- laneCount;
- ordered rows keyed by commit object ID;
- node lane and lane transitions;
- relationship and boundary metadata needed by the SVG renderer.

The browser rejects unsupported schema versions with a useful static error
inside the report rather than attempting a best-effort rendering. Additive
fields within a schema version may be ignored; semantic or required-field
changes increment the version.

## Browser startup contract

Go assembly provides one mount element with the ID `gitlog-html-app` and one
non-executable JSON script element with the ID `gitlog-html-data` and type
`application/json`. The classic frontend IIFE runs after both elements, reads
the data element through `textContent`, validates schema version 1, and mounts
the Svelte application into the mount element. Startup failures replace the
mount contents with an intentional readable error state.

The deterministic frontend build writes exactly
`internal/report/assets/app.js` and `internal/report/assets/app.css`. These
files contain no source map reference, import, dynamic chunk, or external
resource and are committed so the later Go assembly layer can embed them
without Node.

## Safe embedding

Serialize dynamic content with Go's JSON encoder and preserve its HTML escaping
for less-than, greater-than, and ampersand characters. The data block must
remain valid even when text contains closing-script sequences, quotes,
backslashes, Unicode separators, or HTML-looking content.

The Svelte application uses ordinary text interpolation. It must not use raw
HTML rendering for any repository or explanation field.

Use a per-document content-security-policy nonce for the inlined style, data,
and executable script elements. The policy denies all resources by default,
allows only the known nonced inline content, denies network connections, and
disables base-URI and form submission behavior. CSP is defense in depth;
correct escaping remains mandatory.

See [security.md](security.md) for the full trust model.

## Frontend assets

Vite builds the Svelte client as:

- one bundled IIFE with Svelte and application code;
- one bundled stylesheet;
- no imports, chunks, source maps, or externalized packages.

The deterministic build output is committed under the Go report package and
embedded into the executable. A normal Go build therefore does not require
Node. Frontend contributors rebuild it from web source, and CI rejects stale
assets.

Go performs final assembly rather than relying on a single-file Vite plugin.
This gives the renderer one place to enforce escaping, CSP, metadata, and
atomic file output.

## Metadata and offline behavior

The head includes:

- UTF-8 charset before text-bearing content;
- responsive viewport configuration;
- report title derived from the inert repository display name;
- color-scheme support;
- content-security policy;
- no base element.

The application does not assume a writable origin, local storage, cookies, or
network permissions. Selection state may be reflected in the URL fragment.
All other interaction state is ephemeral.

## Degraded behavior

When JavaScript is disabled, the file displays a concise explanation that the
interactive report requires JavaScript. Generating a duplicate server-rendered
history is deferred because it would create two presentation implementations.

If application startup fails or the schema is unsupported, the mount point
shows a readable failure rather than remaining blank. Startup code should be
small enough to catch parsing and mount errors before Svelte takes over.

## Size and performance

The default report is intentionally small. The design still avoids work
quadratic in message length or commit count. The UI renders the selected slice
without virtual scrolling initially; add virtualization only after measured
need because it complicates graph alignment and accessibility.

Diffs are excluded from the first schema. Adding them later requires an
explicit size, privacy, and rendering design rather than an unused placeholder.
