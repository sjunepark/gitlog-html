import { render, screen, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CommitDetails from '../src/components/CommitDetails.svelte'
import { containsBidiControls } from '../src/lib/format'
import { fixture } from './helpers'

const ordinary = fixture('ordinary')
const shallow = fixture('detached-shallow')
const hostile = fixture('edge-content')

function open(commit = ordinary.commits[0]!, commits = ordinary.commits) {
  const onselectparent = vi.fn()
  const result = render(CommitDetails, { props: { commit, commits, onselectparent } })
  return { ...result, onselectparent }
}

describe('commit details', () => {
  it('opens on the explanation when one exists', () => {
    open()
    const explanation = screen.getByRole('tab', { name: 'Explanation' })
    expect(explanation).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel').textContent).toContain('quote builder')
  })

  it('switches to the raw commit message and back', async () => {
    open()
    await userEvent.click(screen.getByRole('tab', { name: 'Commit message' }))
    expect(screen.getByRole('tabpanel').textContent).toContain(
      'Brings the new quote builder onto main after review.'
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Explanation' }))
    expect(screen.getByRole('tabpanel').textContent).toContain('main line of work')
  })

  it('moves between tabs with the arrow keys', async () => {
    open()
    const explanation = screen.getByRole('tab', { name: 'Explanation' })
    explanation.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Commit message' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Explanation' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('offers no toggle at all when there is no explanation', () => {
    const { container } = open(ordinary.commits[7]!)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(container.querySelector('.raw-message')?.textContent).toContain(
      ordinary.commits[7]!.subject
    )
    // No placeholder may imply an explanation was written and lost.
    expect(container.textContent).not.toMatch(/no explanation|not analy/i)
  })

  it('preserves the raw message byte for byte, including hostile sequences', async () => {
    const commit = hostile.commits[0]!
    const { container } = open(commit, hostile.commits)
    await userEvent.click(screen.getByRole('tab', { name: 'Commit message' }))
    expect(container.querySelector('.raw-message')?.textContent).toBe(commit.rawMessage)
    expect(container.querySelector('script')).toBeNull()
  })

  it('keeps explanation paragraphs and line breaks without rendering markup', () => {
    const { container } = open(hostile.commits[0]!, hostile.commits)
    const prose = container.querySelector('.prose')
    expect(prose?.textContent).toBe(hostile.commits[0]!.explanation)
    expect(container.querySelector('strong')).toBeNull()
    expect(container.textContent).toContain("<script>alert('explanation')</script>")
  })

  it('preserves the explanation byte for byte, including every blank line', () => {
    // Leading blanks, a run of blank separators, trailing blanks, indentation,
    // a carriage return, and markup-like text: all of it is evidence.
    const explanation =
      '\n\n   Leading blank lines and indentation survive.\n' +
      '\n\n\n' +
      'Three blank lines above this one, not collapsed to one.\r\n' +
      '\tA tab-indented line.\n' +
      "Markup-like text stays text: </p><script>alert('x')</script> & <b>bold?</b>\n" +
      '\n  \n'

    const commit = { ...ordinary.commits[0]!, explanation }
    const { container } = open(commit, ordinary.commits)

    const prose = container.querySelector('.prose')
    expect(prose?.textContent).toBe(explanation)
    expect(prose?.childElementCount).toBe(0)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    // Whitespace is preserved by CSS, not by rewriting the text.
    expect(prose?.className).toBe('prose')
  })

  it('warns about bidirectional controls without touching the text', async () => {
    // The characters stay exactly where they were recorded; the notice is how
    // the reader learns that what is shown and what is stored can differ.
    const commit = hostile.commits[0]!
    const { container } = open(commit, hostile.commits)
    expect(container.querySelector('.prose')?.textContent).toBe(commit.explanation)
    expect(container.querySelector('.notice--inline')?.textContent).toContain(
      'bidirectional formatting characters'
    )

    await userEvent.click(screen.getByRole('tab', { name: 'Commit message' }))
    expect(container.querySelector('.raw-message')?.textContent).toBe(commit.rawMessage)
  })

  it.each([
    ['explanation', '.prose'],
    ['commit message', '.raw-message']
  ])('marks every bidi control in the %s while keeping the text exact', async (mode, selector) => {
    const commit = hostile.commits[0]!
    const source = mode === 'explanation' ? commit.explanation! : commit.rawMessage
    const { container } = open(commit, hostile.commits)
    if (mode === 'commit message') {
      await userEvent.click(screen.getByRole('tab', { name: 'Commit message' }))
    }

    const field = container.querySelector(selector)!
    // The evidence is untouched: the DOM still holds every original code point.
    expect(field.textContent).toBe(source)

    const controls = [...source].filter((character) =>
      containsBidiControls(character)
    )
    const marks = [...field.querySelectorAll('.bidi-mark')]
    expect(marks).toHaveLength(controls.length)
    expect(marks.length).toBeGreaterThan(0)

    marks.forEach((mark, index) => {
      // Each control stands alone in its own isolate and carries a visible
      // badge (from CSS) plus a spoken name (from aria-label).
      expect(mark.textContent).toBe(controls[index])
      expect(mark.getAttribute('data-mark')).toMatch(/^[A-Z]{3}$/)
      expect(mark.getAttribute('role')).toBe('img')
      expect(mark.getAttribute('aria-label')).toMatch(/^Bidirectional control: /)
    })
    // No repository content ever becomes markup.
    expect(field.querySelector('script')).toBeNull()
  })

  it('adds no markers to text that has no bidi controls', () => {
    const { container } = open()
    expect(container.querySelectorAll('.bidi-mark')).toHaveLength(0)
    expect(container.querySelector('.prose')?.textContent).toBe(ordinary.commits[0]!.explanation)
  })

  it('stays silent when the text has no bidirectional controls', () => {
    const { container } = open()
    expect(container.querySelector('.notice--inline')).toBeNull()
  })

  it('keeps the panel focusable when there is no explanation to tab to', () => {
    const { container } = open(ordinary.commits[7]!)
    const panel = container.querySelector('.details__panel')
    expect(panel).toHaveAttribute('tabindex', '0')
    expect(panel).toHaveAttribute('aria-labelledby')
    const label = container.querySelector(`#${panel!.getAttribute('aria-labelledby')}`)
    expect(label?.textContent).toBe('Commit message')
  })

  it('shows an explanation that is only whitespace-separated markup as text', () => {
    const explanation = '<img src=x onerror=alert(1)>\n\n</script>'
    const commit = { ...ordinary.commits[0]!, explanation }
    const { container } = open(commit, ordinary.commits)
    expect(container.querySelector('.prose')?.textContent).toBe(explanation)
    expect(container.querySelector('img')).toBeNull()
  })

  it('lists metadata explanation-first and in the documented order', () => {
    const { container } = open()
    const terms = [...container.querySelectorAll('.meta__term')].map((node) => node.textContent)
    expect(terms).toEqual(['Recorded', 'Labels', 'Commit ID', 'Builds on'])
    const position = container
      .querySelector('.details__panel')!
      .compareDocumentPosition(container.querySelector('.meta')!)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('names a single parent without merge language', () => {
    const { container } = open(ordinary.commits[1]!)
    const terms = [...container.querySelectorAll('.meta__term')].map((node) => node.textContent)
    expect(terms).toContain('Comes after')
    expect(terms).not.toContain('Builds on')
  })

  it('names the author separately only when that tells the reader something', () => {
    const { container } = open(ordinary.commits[5]!)
    const terms = [...container.querySelectorAll('.meta__term')].map((node) => node.textContent)
    expect(terms).toContain('Originally written')
    expect(container.textContent).toContain('Noor Haddad')
  })

  it('makes a visible parent a working control', async () => {
    const { onselectparent } = open()
    const parent = screen.getByRole('button', {
      name: /Fixed a rounding problem/
    })
    await userEvent.click(parent)
    expect(onselectparent).toHaveBeenCalledWith(ordinary.commits[1]!.oid)
  })

  it('states a parent outside the slice instead of offering a broken control', () => {
    const merge = shallow.commits[2]!
    const { container } = open(merge, shallow.commits)
    const outside = container.querySelector('.parents__outside')
    expect(outside).not.toBeNull()
    expect(outside?.tagName).toBe('DIV')
    expect(outside?.textContent).toContain('Not in this copy of the repository')
    expect(outside?.textContent).toContain(merge.parents[1]!.oid)
    expect(within(outside as HTMLElement).queryByRole('button')).toBeNull()
  })

  it('keeps a boundary reason when the same object is reachable elsewhere', async () => {
    // A shallow boundary edge whose object another ref also puts in the report.
    // Visibility describes the relationship, so the reason must survive the
    // object being on screen.
    const merge = shallow.commits[2]!
    const boundaryOid = merge.parents[1]!.oid
    expect(merge.parents[1]!.visibility).toBe('shallow-boundary')

    const alsoVisible = {
      ...shallow.commits[3]!,
      oid: boundaryOid,
      abbreviatedOid: boundaryOid.slice(0, 12),
      parents: [],
      subject: 'Reached through another branch',
      rawMessage: 'Reached through another branch\n'
    }
    const commits = [...shallow.commits, alsoVisible]
    const onselectparent = vi.fn()
    const { container } = render(CommitDetails, {
      props: { commit: merge, commits, onselectparent }
    })

    const entry = container.querySelectorAll('.parents__item')[1]
    expect(entry?.textContent).toContain('missing from this copy of the repository')
    expect(entry?.textContent).toContain('appears elsewhere in this report')
    expect(entry?.textContent).toContain(boundaryOid)

    // Navigation is offered, and the reason is part of the control's name.
    const control = within(entry as HTMLElement).getByRole('button')
    expect(control.textContent).toContain('missing from this copy of the repository')
    await userEvent.click(control)
    expect(onselectparent).toHaveBeenCalledWith(boundaryOid)
  })

  it('adds no boundary note to an ordinary visible parent', () => {
    const { container } = open()
    expect(container.querySelector('.parents__boundary')).toBeNull()
    expect(container.querySelectorAll('.parents__link')).toHaveLength(2)
  })

  it('shows the full object ID as evidence', () => {
    const { container } = open()
    expect(container.textContent).toContain(ordinary.commits[0]!.oid)
  })
})
