/**
 * Reader-facing formatting. Every function here treats its input as untrusted
 * text and returns plain strings; nothing in this module produces markup.
 */

import type { Commit, HeadState, Ref, Selection } from './schema'

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
 * Timestamps come from Git and can be malformed in a hostile repository, so
 * every formatter falls back to the raw string instead of printing
 * "Invalid Date".
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
  return parts.join('. ')
}

export function boundaryLabel(visibility: string): string {
  return visibility === 'shallow-boundary'
    ? 'Not in this copy of the repository'
    : 'Outside this report'
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
