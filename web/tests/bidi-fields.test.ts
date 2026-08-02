import { render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import App from '../src/components/App.svelte'
import CommitDetails from '../src/components/CommitDetails.svelte'
import CommitRow from '../src/components/CommitRow.svelte'
import EmptyHistory from '../src/components/EmptyHistory.svelte'
import RefLabel from '../src/components/RefLabel.svelte'
import ReportHeader from '../src/components/ReportHeader.svelte'
import { SPLIT_LAYOUT_QUERY } from '../src/lib/media.svelte'
import { containsBidiControls, neutralizeBidiControls } from '../src/lib/format'
import { fixture } from './helpers'
import { matchingMedia } from './setup'

/**
 * A bidi control is only harmless where it is marked.
 *
 * An override left active inside a repository name, a ref label or an author
 * line can reorder the characters around it, so a reader is shown something
 * other than what Git recorded — in exactly the places used to decide whether a
 * report is trustworthy. Every untrusted field therefore renders through
 * BidiText, and every one of them is checked here: the control survives in
 * `textContent`, and it is wrapped in an isolated, named marker.
 */

const hostile = fixture('edge-content')
const seeded = hostile.commits[1]!

/** Asserts a field kept its text intact and marked every control in it. */
function expectMarked(field: Element | null | undefined, source: string, where: string): void {
  expect(field, `${where} is missing`).toBeTruthy()
  const element = field as Element
  expect(element.textContent, `${where} changed the recorded text`).toBe(source)

  const controls = [...source].filter((character) => containsBidiControls(character))
  expect(controls.length, `${where} has no control to mark`).toBeGreaterThan(0)

  const marks = [...element.querySelectorAll('.bidi-mark')]
  expect(marks, `${where} left a control unmarked`).toHaveLength(controls.length)
  marks.forEach((mark, index) => {
    expect(mark.textContent, `${where} marker ${index} lost its character`).toBe(controls[index])
    expect(mark.getAttribute('role')).toBe('img')
    expect(mark.getAttribute('aria-label')).toMatch(/^Bidirectional control: /)
    expect(mark.getAttribute('data-mark')).toMatch(/^[A-Z]{3}$/)
  })
}

describe('bidi controls in identity and label fields', () => {
  it('marks the repository name and the branch in the header', () => {
    const { container } = render(ReportHeader, { props: { report: hostile } })
    expectMarked(container.querySelector('h1'), hostile.repository.name, 'the repository name')

    const head = container.querySelector('.report-header__head')
    expect(head?.textContent).toContain(hostile.repository.head.branch)
    expect(head?.querySelectorAll('.bidi-mark').length).toBeGreaterThan(0)
  })

  it('marks the subject shown in a history row', () => {
    const { container } = render(CommitRow, {
      props: { commit: seeded, position: 2, total: 4, selected: false, onselect: vi.fn() }
    })
    expectMarked(container.querySelector('.commit-row__summary'), seeded.subject, 'the row subject')
  })

  it('marks every ref label', () => {
    for (const ref of seeded.refs) {
      const { container } = render(RefLabel, { props: { ref } })
      expectMarked(container.querySelector('.ref__name'), ref.displayName, `ref ${ref.kind}`)
    }
  })

  it('marks the author and committer identities in the details', () => {
    const { container } = render(CommitDetails, {
      props: { commit: seeded, commits: hostile.commits, onselectparent: vi.fn() }
    })
    const people = [...container.querySelectorAll('.meta__person')]
    expect(people).toHaveLength(2)
    expectMarked(
      people[0],
      `${seeded.committer.name} <${seeded.committer.email}>`,
      'the committer identity'
    )
    expectMarked(people[1], `${seeded.author.name} <${seeded.author.email}>`, 'the author identity')
  })

  it('marks the subject shown as the details title', () => {
    matchingMedia.add(SPLIT_LAYOUT_QUERY)
    window.location.hash = seeded.oid
    const { container } = render(App, { props: { report: hostile } })
    expectMarked(
      container.querySelector('.details-pane__subject'),
      seeded.subject,
      'the details title'
    )
  })

  it('marks the branch name in the empty state', () => {
    const branch = `main${String.fromCharCode(0x202e)}bc${String.fromCharCode(0x202c)}`
    const report = {
      ...hostile,
      commits: [],
      selection: { ...hostile.selection, includedCount: 0 },
      repository: { ...hostile.repository, head: { kind: 'unborn' as const, branch } }
    }
    const { container } = render(EmptyHistory, { props: { report } })
    expectMarked(container.querySelector('.empty__branch'), branch, 'the unborn branch name')
  })

  it('names controls in the accessible name, which no markup can protect', () => {
    // aria-label replaces the element's text for assistive technology, so the
    // marked-up spans inside the row never reach it.
    const { container } = render(CommitRow, {
      props: { commit: seeded, position: 2, total: 4, selected: false, onselect: vi.fn() }
    })
    const label = container.querySelector('.commit-row')?.getAttribute('aria-label') ?? ''

    expect(label).not.toBe('')
    expect(containsBidiControls(label), 'the accessible name still carries a live control').toBe(
      false
    )
    expect(label).toContain('[RLO]')
    expect(label).toContain('[PDF]')
    // The subject and the ref names still reach the reader, just named.
    expect(label).toContain('Record a very long message')
    expect(label).toContain('feature/A[RLO]BC[PDF] Z')
  })

  it('names controls in the live status without touching the visible title', () => {
    matchingMedia.add(SPLIT_LAYOUT_QUERY)
    window.location.hash = seeded.oid
    const { container } = render(App, { props: { report: hostile } })

    const status = container.querySelector('[role="status"]')?.textContent ?? ''
    expect(status).toContain('Showing details for')
    expect(containsBidiControls(status), 'the live status still carries a live control').toBe(false)
    expect(status).toContain('[RLO]')
    expect(status).toContain('[PDF]')

    // The visible title beside it keeps the original code points and marks them.
    const title = container.querySelector('.details-pane__subject')
    expect(title?.textContent).toBe(seeded.subject)
    expect(containsBidiControls(title?.textContent ?? '')).toBe(true)
  })

  it('names every supported control and leaves everything else untouched', () => {
    const controls = [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]
    const names = ['ALM', 'LRM', 'RLM', 'LRE', 'RLE', 'PDF', 'LRO', 'RLO', 'LRI', 'RLI', 'FSI', 'PDI']
    controls.forEach((code, index) => {
      expect(neutralizeBidiControls(`a${String.fromCharCode(code)}b`)).toBe(
        `a[${names[index]}]b`
      )
    })
    // A zero-width joiner is not a directional control and is not renamed.
    expect(neutralizeBidiControls(`a${String.fromCharCode(0x200d)}b`)).toBe(
      `a${String.fromCharCode(0x200d)}b`
    )
    expect(neutralizeBidiControls('plain text')).toBe('plain text')
  })

  it('leaves ordinary text completely alone', () => {
    // No control, no marker, no wrapper: the common case is untouched.
    const ordinary = fixture('ordinary')
    const { container } = render(ReportHeader, { props: { report: ordinary } })
    expect(container.querySelectorAll('.bidi-mark')).toHaveLength(0)
    expect(container.querySelector('h1')?.textContent).toBe(ordinary.repository.name)
  })
})
