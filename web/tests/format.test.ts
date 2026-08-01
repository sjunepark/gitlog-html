import { describe, expect, it } from 'vitest'
import {
  authorDiffersFromCommitter,
  boundaryLabel,
  commitAccessibleLabel,
  describeHead,
  describeRefKind,
  describeScope,
  formatDate,
  machineDateTime,
  parentBoundaryNote,
  personText,
  summaryText
} from '../src/lib/format'
import type { Commit } from '../src/lib/schema'
import { fixture } from './helpers'

const report = fixture('ordinary')
const merge = report.commits[0]!
const plain = report.commits[7]!

function withPeople(base: Commit, author: Partial<Commit['author']>): Commit {
  return { ...base, author: { ...base.author, ...author } }
}

describe('reader-facing language', () => {
  it('states HEAD in plain words for every state', () => {
    expect(describeHead({ kind: 'branch', branch: 'main' })).toBe('On branch main')
    expect(describeHead({ kind: 'detached' })).toBe('Detached HEAD — not on a branch')
    expect(describeHead({ kind: 'unborn', branch: 'main' })).toBe(
      'Branch main has no commits yet'
    )
  })

  it('describes the slice without Git jargon', () => {
    expect(describeScope(report.selection)).toBe(
      'Latest 10 commits across all branches and tags'
    )
    expect(
      describeScope({ scope: 'current', maximumCount: 10, includedCount: 4, truncated: false })
    ).toBe('All 4 commits on the current branch')
    expect(
      describeScope({ scope: 'all', maximumCount: 10, includedCount: 0, truncated: false })
    ).toBe('No commits across all branches and tags')
  })

  it('names ref kinds so colour is never the only signal', () => {
    expect(describeRefKind({ ...merge.refs[0]!, kind: 'local-branch' })).toBe('Branch')
    expect(describeRefKind({ ...merge.refs[0]!, kind: 'remote-branch' })).toBe('Remote branch')
    expect(describeRefKind({ ...merge.refs[0]!, kind: 'tag' })).toBe('Tag')
  })

  it('distinguishes a truncated parent from one missing in a shallow clone', () => {
    expect(boundaryLabel('maximum-count-boundary')).toBe('Outside this report')
    expect(boundaryLabel('shallow-boundary')).toBe('Not in this copy of the repository')
  })

  it('states a boundary reason even when the object is reachable elsewhere', () => {
    expect(parentBoundaryNote('visible', false)).toBeNull()
    expect(parentBoundaryNote('visible', true)).toBeNull()
    expect(parentBoundaryNote('shallow-boundary', false)).toBe(
      'Not in this copy of the repository'
    )
    expect(parentBoundaryNote('shallow-boundary', true)).toContain(
      'missing from this copy of the repository'
    )
    expect(parentBoundaryNote('shallow-boundary', true)).toContain(
      'appears elsewhere in this report'
    )
    expect(parentBoundaryNote('maximum-count-boundary', false)).toBe('Outside this report')
    expect(parentBoundaryNote('maximum-count-boundary', true)).toContain(
      'continues past the end of this report'
    )
  })
})

describe('commit summaries', () => {
  it('prefers the explanation and falls back to the subject', () => {
    expect(summaryText(merge)).toBe(
      'Brought the new quote builder onto the main line of work. Everything that was being developed separately is now part of the product the team ships.'
    )
    expect(plain.explanation).toBeUndefined()
    expect(summaryText(plain)).toBe(plain.subject)
  })

  it('never leaves a row without a label', () => {
    expect(summaryText({ ...plain, subject: '', rawMessage: '' })).toBe('(no commit message)')
  })

  it('gives the button the information the graph shows visually', () => {
    const label = commitAccessibleLabel(merge, 1, 10)
    expect(label).toContain('Commit 1 of 10')
    expect(label).toContain('Branch main')
    expect(label).toContain('Merge of 2 commits')
  })

  it('announces a root as the start of history', () => {
    const root = fixture('edge-content').commits.at(-1)!
    expect(commitAccessibleLabel(root, 4, 4)).toContain('Start of history')
  })
})

describe('identity and timestamps', () => {
  it('hides the author when it is the same person on the same day', () => {
    expect(authorDiffersFromCommitter(merge)).toBe(false)
  })

  it('shows the author when someone else wrote it, or when the day differs', () => {
    expect(authorDiffersFromCommitter(report.commits[5]!)).toBe(true)
    expect(authorDiffersFromCommitter(withPeople(merge, { name: 'Someone Else' }))).toBe(true)
  })

  it('falls back to the raw value rather than printing an invalid date', () => {
    expect(formatDate('not a timestamp')).toBe('not a timestamp')
    expect(machineDateTime('not a timestamp')).toBe('')
  })

  it('formats an identity without inventing missing parts', () => {
    expect(personText('Dana', 'dana@example.test')).toBe('Dana <dana@example.test>')
    expect(personText('', 'dana@example.test')).toBe('dana@example.test')
    expect(personText('Dana', '')).toBe('Dana')
    expect(personText('', '')).toBe('Unknown')
  })
})
