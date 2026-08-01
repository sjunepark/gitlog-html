import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CommitRow from '../src/components/CommitRow.svelte'
import { fixture } from './helpers'

const hostile = fixture('edge-content')
const ordinary = fixture('ordinary')

describe('commit row', () => {
  it('is a native button that pointer, Enter, and Space all activate', async () => {
    const onselect = vi.fn()
    render(CommitRow, {
      props: { commit: ordinary.commits[0]!, position: 1, total: 10, selected: false, onselect }
    })
    const button = screen.getByRole('button')
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')

    await userEvent.click(button)
    button.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onselect).toHaveBeenCalledTimes(3)
    expect(onselect.mock.calls[0]?.[0]).toBe(ordinary.commits[0]!.oid)
  })

  it('marks the selected row for assistive technology, not only visually', () => {
    render(CommitRow, {
      props: {
        commit: ordinary.commits[0]!,
        position: 1,
        total: 10,
        selected: true,
        onselect: vi.fn()
      }
    })
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true')
  })

  it('renders hostile commit text as inert text, never as markup', () => {
    const commit = hostile.commits[0]!
    const { container } = render(CommitRow, {
      props: { commit, position: 1, total: 4, selected: false, onselect: vi.fn() }
    })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toContain('<img')
    expect(container.textContent).toContain("</script><script>alert('explanation')</script>")
  })

  it('shows the commit subject when there is no explanation to show', () => {
    const commit = ordinary.commits[7]!
    const { container } = render(CommitRow, {
      props: { commit, position: 8, total: 10, selected: false, onselect: vi.fn() }
    })
    expect(container.querySelector('.commit-row__summary')?.textContent?.trim()).toBe(
      commit.subject
    )
  })

  it('labels each ref with its kind so colour is not the only cue', () => {
    const commit = ordinary.commits[0]!
    const { container } = render(CommitRow, {
      props: { commit, position: 1, total: 10, selected: false, onselect: vi.fn() }
    })
    const refs = container.querySelectorAll('.ref')
    expect(refs).toHaveLength(2)
    expect(refs[0]?.textContent).toContain('Branch')
    expect(refs[0]?.textContent).toContain('currently checked out')
    expect(refs[1]?.textContent).toContain('Remote branch')
  })

  it('exposes a machine-readable commit time', () => {
    const commit = ordinary.commits[0]!
    const { container } = render(CommitRow, {
      props: { commit, position: 1, total: 10, selected: false, onselect: vi.fn() }
    })
    expect(container.querySelector('time')).toHaveAttribute('datetime', commit.committer.when)
  })
})
