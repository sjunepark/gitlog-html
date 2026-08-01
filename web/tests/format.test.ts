import { describe, expect, it } from 'vitest'
import {
  authorDiffersFromCommitter,
  boundaryLabel,
  commitAccessibleLabel,
  commitTitle,
  containsBidiControls,
  describeHead,
  describeRefKind,
  describeScope,
  formatDate,
  machineDateTime,
  parentBoundaryNote,
  personText,
  segmentBidiControls,
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
    expect(describeRefKind({ ...merge.refs[0]!, kind: 'other' })).toBe('Reference')
  })

  it('distinguishes a truncated parent from one missing in a shallow clone', () => {
    expect(boundaryLabel('maximum-count-boundary')).toBe('Outside this report')
    expect(boundaryLabel('shallow-boundary')).toBe('Not in this copy of the repository')
    // A non-boundary visibility must never borrow a boundary sentence.
    expect(boundaryLabel('visible')).toBe('Shown in this report')
  })

  it('states a boundary reason even when the object is reachable elsewhere', () => {
    expect(parentBoundaryNote('visible', true)).toBeNull()
    // A parent declared visible that is not in the report is schema-invalid;
    // the note says so instead of leaving the row blank.
    expect(parentBoundaryNote('visible', false)).toBe('Not shown in this report')
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

  it('gives every empty-message surface the same title', () => {
    expect(commitTitle(plain)).toBe(plain.subject)
    expect(commitTitle({ ...plain, subject: '   ' })).toBe('(no commit message)')
    expect(commitTitle({ ...plain, subject: '' })).toBe('(no commit message)')
  })

  it('shows a subject exactly as recorded, spacing included', () => {
    // Trimming decides whether a subject exists; it must never edit one.
    expect(commitTitle({ ...plain, subject: '  padded subject  ' })).toBe('  padded subject  ')
    expect(commitTitle({ ...plain, subject: '\ttabbed\t' })).toBe('\ttabbed\t')
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
    expect(authorDiffersFromCommitter(withPeople(merge, { email: 'other@example.test' }))).toBe(true)
    // Same person, earlier day: the date comparison is why formatDate is here.
    expect(authorDiffersFromCommitter(withPeople(merge, { when: '2026-07-01T16:20:00Z' }))).toBe(
      true
    )
  })

  it('reports bidirectional formatting characters without altering the text', () => {
    const hostile = fixture('edge-content').commits[0]!
    expect(containsBidiControls(hostile.explanation)).toBe(true)
    expect(containsBidiControls('plain text')).toBe(false)
    expect(containsBidiControls(undefined)).toBe(false)
    expect(containsBidiControls('a', undefined, `b${String.fromCharCode(0x202e)}c`)).toBe(true)
  })
})

describe('bidi segmentation', () => {
  const RLO = String.fromCharCode(0x202e)
  const PDF = String.fromCharCode(0x202c)

  const rejoin = (text: string) =>
    segmentBidiControls(text)
      .map((segment) => segment.value)
      .join('')

  it('returns one segment for text with no controls', () => {
    expect(segmentBidiControls('plain text')).toEqual([{ control: false, value: 'plain text' }])
  })

  it('returns nothing for empty text', () => {
    expect(segmentBidiControls('')).toEqual([])
  })

  it('isolates each control as its own segment, named for the reader', () => {
    expect(segmentBidiControls(`A${RLO}BC${PDF} Z`)).toEqual([
      { control: false, value: 'A' },
      { control: true, value: RLO, mark: 'RLO', label: 'right-to-left override' },
      { control: false, value: 'BC' },
      { control: true, value: PDF, mark: 'PDF', label: 'pop directional formatting' },
      { control: false, value: ' Z' }
    ])
  })

  it.each([
    [0x061c, 'ALM'],
    [0x200e, 'LRM'],
    [0x200f, 'RLM'],
    [0x202a, 'LRE'],
    [0x202b, 'RLE'],
    [0x202c, 'PDF'],
    [0x202d, 'LRO'],
    [0x202e, 'RLO'],
    [0x2066, 'LRI'],
    [0x2067, 'RLI'],
    [0x2068, 'FSI'],
    [0x2069, 'PDI']
  ])('names U+%s as %s', (code, mark) => {
    const segments = segmentBidiControls(String.fromCharCode(code as number))
    expect(segments).toHaveLength(1)
    expect(segments[0]?.control).toBe(true)
    expect(segments[0]?.mark).toBe(mark)
    expect(segments[0]?.label).toBeTruthy()
  })

  it.each([
    ['plain text', 'plain text'],
    [`${RLO}`, 'a lone control'],
    [`${RLO}${PDF}`, 'adjacent controls'],
    [`A${RLO}B`, 'a control between letters'],
    ['line one\n\n  line three\t', 'whitespace and line breaks'],
    ['한글 👋 emoji and astral text', 'multi-byte characters']
  ])('rebuilds the input exactly for %s (%s)', (text) => {
    // The segments are a view of the text, never an edit of it.
    expect(rejoin(text)).toBe(text)
  })

  it('rebuilds the hostile fixture explanation and raw message exactly', () => {
    const hostile = fixture('edge-content').commits[0]!
    expect(rejoin(hostile.explanation ?? '')).toBe(hostile.explanation)
    expect(rejoin(hostile.rawMessage)).toBe(hostile.rawMessage)
    expect(segmentBidiControls(hostile.rawMessage).some((s) => s.control)).toBe(true)
  })

  it('does not treat ordinary invisible characters as bidi controls', () => {
    // A zero-width joiner is not a directional control and is left in the text.
    const zwj = String.fromCharCode(0x200d)
    expect(segmentBidiControls(`a${zwj}b`)).toEqual([{ control: false, value: `a${zwj}b` }])
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
