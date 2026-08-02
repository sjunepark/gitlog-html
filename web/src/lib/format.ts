/**
 * Reader-facing formatting. Every function here treats its input as untrusted
 * text and returns plain strings; nothing in this module produces markup.
 */

import type { Commit, HeadState, ParentVisibility, Ref, Selection } from './schema'

const dateOnly = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

const timeOnly = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit'
})

const dateAndTime = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

function parse(timestamp: string): Date | null {
  const value = new Date(timestamp)
  return Number.isNaN(value.getTime()) ? null : value
}

/**
 * Timestamps come from Git and can be malformed in a hostile repository, so no
 * formatter ever prints "Invalid Date". `formatDate` and `formatDateTime` fall
 * back to the raw string; `formatTime` returns an empty string, because a full
 * timestamp dropped into a time-only slot would misinform the reader.
 */
export function formatDate(timestamp: string): string {
  const value = parse(timestamp)
  return value === null ? timestamp : dateOnly.format(value)
}

export function formatTime(timestamp: string): string {
  const value = parse(timestamp)
  return value === null ? '' : timeOnly.format(value)
}

export function formatDateTime(timestamp: string): string {
  const value = parse(timestamp)
  return value === null ? timestamp : dateAndTime.format(value)
}

/** Machine-readable value for <time datetime>. Empty when unparseable. */
export function machineDateTime(timestamp: string): string {
  return parse(timestamp) === null ? '' : timestamp
}

export function describeHead(head: HeadState): string {
  switch (head.kind) {
    case 'branch':
      return `On branch ${head.branch ?? ''}`.trimEnd()
    case 'detached':
      return 'Detached HEAD — not on a branch'
    case 'unborn':
      return `Branch ${head.branch ?? ''} has no commits yet`.trimEnd()
  }
}

export function describeScope(selection: Selection): string {
  const where = selection.scope === 'all' ? 'across all branches and tags' : 'on the current branch'
  if (selection.includedCount === 0) return `No commits ${where}`
  const commits = selection.includedCount === 1 ? 'commit' : 'commits'
  const prefix = selection.truncated ? 'Latest' : 'All'
  return `${prefix} ${selection.includedCount} ${commits} ${where}`
}

const REF_KIND_LABELS = {
  'local-branch': 'Branch',
  'remote-branch': 'Remote branch',
  tag: 'Tag',
  other: 'Reference'
} as const

export function describeRefKind(ref: Ref): string {
  return REF_KIND_LABELS[ref.kind]
}

/** Row label: the explanation wins, and the subject is the honest fallback. */
export function summaryText(commit: Commit): string {
  const explanation = commit.explanation
  if (explanation !== undefined) {
    const firstParagraph = explanation.trim().split(/\n\s*\n/, 1)[0] ?? ''
    if (firstParagraph.trim() !== '') return firstParagraph.replace(/\s+/g, ' ').trim()
  }
  const subject = commit.subject.trim()
  return subject === '' ? '(no commit message)' : subject
}

/**
 * Accessible name for a commit's selection control. It carries the same
 * information the SVG conveys visually, which is why the graph can be hidden
 * from assistive technology.
 */
export function commitAccessibleLabel(commit: Commit, position: number, total: number): string {
  const parts = [`Commit ${position} of ${total}`, summaryText(commit)]
  if (commit.refs.length > 0) {
    parts.push(commit.refs.map((ref) => `${describeRefKind(ref)} ${ref.displayName}`).join(', '))
  }
  if (commit.parents.length >= 2) parts.push(`Merge of ${commit.parents.length} commits`)
  if (commit.parents.length === 0) parts.push('Start of history')
  parts.push(formatDateTime(commit.committer.when))
  // An accessible name replaces the element's own text for assistive
  // technology, so the marked-up spans inside the row cannot protect it. The
  // controls are named here instead.
  return neutralizeBidiControls(parts.join('. '))
}

/** Exhaustive by construction: a new visibility forces a wording decision. */
const BOUNDARY_LABELS: Record<ParentVisibility, string> = {
  visible: 'Shown in this report',
  'shallow-boundary': 'Not in this copy of the repository',
  'maximum-count-boundary': 'Outside this report'
}

export function boundaryLabel(visibility: ParentVisibility): string {
  return BOUNDARY_LABELS[visibility]
}

const SHOWN_ELSEWHERE: Record<ParentVisibility, string | null> = {
  visible: null,
  'shallow-boundary':
    'This link is missing from this copy of the repository. The commit itself appears elsewhere in this report.',
  'maximum-count-boundary':
    'This link continues past the end of this report. The commit itself appears elsewhere in this report.'
}

/**
 * Explains a parent link when it needs explaining, and returns null when it
 * does not.
 *
 * The same object can be a boundary on this edge and still appear elsewhere in
 * the report, because another ref reaches it. Visibility describes the
 * relationship, not the object, so the reason is stated either way — otherwise
 * a link the generator classified as incomplete would read as ordinary
 * ancestry. Every sentence a reader can see about a parent lives here rather
 * than in the markup, so the wording cannot drift between the two layouts.
 */
export function parentBoundaryNote(
  visibility: ParentVisibility,
  shownElsewhere: boolean
): string | null {
  if (visibility === 'visible') {
    return shownElsewhere ? null : 'Not shown in this report'
  }
  return shownElsewhere ? SHOWN_ELSEWHERE[visibility] : boundaryLabel(visibility)
}

/**
 * Fallback title for a commit whose message is empty.
 *
 * Trimming decides whether there is a subject at all; it never edits one. A
 * subject Git recorded with leading or trailing space is shown as recorded.
 */
export function commitTitle(commit: Commit): string {
  return commit.subject.trim() === '' ? '(no commit message)' : commit.subject
}

/**
 * Bidirectional formatting characters can reorder how text displays without
 * changing what it stores. The report never rewrites the evidence, so it says
 * out loud when a field contains them.
 */
// Written as escapes so this source line cannot itself be reordered:
// U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069.
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u

export function containsBidiControls(...values: (string | undefined)[]): boolean {
  return values.some((value) => value !== undefined && BIDI_CONTROLS.test(value))
}

/** Short badge and spoken name for each control, by code point. */
const BIDI_NAMES: Record<number, [mark: string, label: string]> = {
  0x061c: ['ALM', 'Arabic letter mark'],
  0x200e: ['LRM', 'left-to-right mark'],
  0x200f: ['RLM', 'right-to-left mark'],
  0x202a: ['LRE', 'left-to-right embedding'],
  0x202b: ['RLE', 'right-to-left embedding'],
  0x202c: ['PDF', 'pop directional formatting'],
  0x202d: ['LRO', 'left-to-right override'],
  0x202e: ['RLO', 'right-to-left override'],
  0x2066: ['LRI', 'left-to-right isolate'],
  0x2067: ['RLI', 'right-to-left isolate'],
  0x2068: ['FSI', 'first-strong isolate'],
  0x2069: ['PDI', 'pop directional isolate']
}

export interface TextSegment {
  /** True when this segment is a single bidi formatting control. */
  control: boolean
  /** The original characters, always verbatim. */
  value: string
  /** Badge shown for a control, from CSS rather than from the text. */
  mark?: string
  /** Spoken name for a control. */
  label?: string
}

/**
 * Splits untrusted text so each bidi formatting control stands alone.
 *
 * The control characters are kept, not replaced: the segments concatenate back
 * to the input exactly, so the DOM still holds the bytes Git recorded and a
 * copy still yields them. Standing alone is what makes them safe — the renderer
 * puts each one in its own isolate, where an override has nothing left to
 * reorder, and draws a visible badge for it from CSS.
 */
export function segmentBidiControls(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let plain = ''
  for (const character of text) {
    const name = BIDI_NAMES[character.codePointAt(0) ?? -1]
    if (name === undefined) {
      plain += character
      continue
    }
    if (plain !== '') {
      segments.push({ control: false, value: plain })
      plain = ''
    }
    segments.push({ control: true, value: character, mark: name[0], label: name[1] })
  }
  if (plain !== '') segments.push({ control: false, value: plain })
  return segments
}

export const BIDI_NOTICE =
  'This text contains bidirectional formatting characters. They can make it read differently from how it is stored.'

/**
 * Replaces every bidi formatting control with its bracketed short name.
 *
 * This is for strings that never become a text node a reader can inspect —
 * an `aria-label`, a live-region announcement, a document title. Those are
 * consumed as flat strings, so `BidiText`'s per-control isolation cannot reach
 * them and an override inside one still reorders what it is read or displayed
 * beside. Naming the control keeps the string honest about what it contains,
 * and matches what the Go assembler now does for the browser title, so the two
 * layers describe hostile input the same way.
 *
 * Visible evidence surfaces are untouched: they keep the original code points
 * and mark them instead, so nothing is lost from the record.
 */
export function neutralizeBidiControls(text: string): string {
  let out = ''
  for (const character of text) {
    const name = BIDI_NAMES[character.codePointAt(0) ?? -1]
    out += name === undefined ? character : `[${name[0]}]`
  }
  return out
}

/**
 * Author identity is shown separately only when it differs materially from the
 * committer. Ordinary commits record the same person a minute or two apart, and
 * repeating that as a second line would be noise; a different person or a
 * different day is what actually tells the reader something.
 */
export function authorDiffersFromCommitter(commit: Commit): boolean {
  return (
    commit.author.name !== commit.committer.name ||
    commit.author.email !== commit.committer.email ||
    formatDate(commit.author.when) !== formatDate(commit.committer.when)
  )
}

export function personText(name: string, email: string): string {
  if (name === '' && email === '') return 'Unknown'
  if (email === '') return name
  if (name === '') return email
  return `${name} <${email}>`
}
