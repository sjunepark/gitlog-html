import { render, screen, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CommitDetails from '../src/components/CommitDetails.svelte'
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
    const paragraphs = container.querySelectorAll('.prose__paragraph')
    expect(paragraphs.length).toBeGreaterThan(1)
    expect(container.querySelector('strong')).toBeNull()
    expect(container.textContent).toContain("<script>alert('explanation')</script>")
  })

  it('lists metadata explanation-first and in the documented order', () => {
    const { container } = open()
    const terms = [...container.querySelectorAll('.meta__term')].map((node) => node.textContent)
    expect(terms).toEqual(['Recorded', 'Labels', 'Commit ID', 'Builds on'])
    expect(container.querySelector('.details__panel')?.compareDocumentPosition(
      container.querySelector('.meta')!
    )).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
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

  it('shows the full object ID as evidence', () => {
    const { container } = open()
    expect(container.textContent).toContain(ordinary.commits[0]!.oid)
  })
})
