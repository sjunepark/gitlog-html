import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../src/components/App.svelte'
import { SPLIT_LAYOUT_QUERY } from '../src/lib/media.svelte'
import { fixture } from './helpers'
import { matchingMedia, setMediaMatch } from './setup'

function renderSplit(name = 'ordinary') {
  matchingMedia.add(SPLIT_LAYOUT_QUERY)
  return render(App, { props: { report: fixture(name) } })
}

function renderCompact(name = 'ordinary') {
  return render(App, { props: { report: fixture(name) } })
}

describe('report application', () => {
  it('has exactly one page heading and a labelled history region', () => {
    const { container } = renderSplit()
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('acme-quotes')
    expect(screen.getByRole('region', { name: 'Commit history' })).toBeInTheDocument()
  })

  it('presents commits as an ordered semantic list', () => {
    const { container } = renderSplit()
    const list = container.querySelector('ol.history__list')
    expect(list).not.toBeNull()
    expect(list?.querySelectorAll(':scope > li')).toHaveLength(10)
  })

  it('states the scope, the branch, and the truncation limit up front', () => {
    const { container } = renderSplit()
    expect(container.textContent).toContain('On branch main')
    expect(container.textContent).toContain('Latest 10 commits across all branches and tags')
    expect(container.textContent).toContain('History continues before the oldest commit shown here.')
  })

  it('shows no details container until a commit is chosen', () => {
    const { container } = renderSplit()
    expect(container.querySelector('.details')).toBeNull()
    expect(container.querySelector('.details-pane__hint')?.textContent).toContain(
      'Choose a commit'
    )
  })

  it('fills the sticky pane and announces the change once', async () => {
    const report = fixture('ordinary')
    const { container } = renderSplit()
    await userEvent.click(screen.getAllByRole('button')[0]!)
    await waitFor(() => expect(container.querySelector('.details')).not.toBeNull())
    expect(container.querySelector('.details-pane__subject')?.textContent?.trim()).toBe(
      report.commits[0]!.subject
    )
    const status = container.querySelector('[role="status"]')
    expect(status?.textContent).toContain('Showing details for')
    expect(window.location.hash).toBe(`#${report.commits[0]!.oid}`)
  })

  it('opens on the commit named by a valid initial fragment', async () => {
    const report = fixture('ordinary')
    window.location.hash = report.commits[2]!.oid
    const { container } = renderSplit()
    await waitFor(() =>
      expect(container.querySelector('.details-pane__subject')?.textContent?.trim()).toBe(
        report.commits[2]!.subject
      )
    )
  })

  it('ignores an invalid fragment without showing an error', () => {
    window.location.hash = 'deadbeef'
    const { container } = renderSplit()
    expect(container.querySelector('.details')).toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('opens a labelled modal dialog instead of the split pane on a narrow screen', async () => {
    const report = fixture('ordinary')
    const { container } = renderCompact()
    expect(container.querySelector('.details-pane')).toBeNull()
    await userEvent.click(screen.getAllByRole('button')[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('open')
    expect(
      screen.getByRole('heading', { level: 2, name: report.commits[0]!.subject })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Close/ })).toBeInTheDocument()
  })

  it('closes the dialog, clears the fragment, and returns focus to the commit', async () => {
    renderCompact()
    const row = screen.getAllByRole('button')[0]!
    await userEvent.click(row)
    await userEvent.click(await screen.findByRole('button', { name: /Close/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.hash).toBe('')
    await waitFor(() => expect(document.activeElement).toBe(row))
  })

  it('keeps the selection when the viewport widens past the split breakpoint', async () => {
    const report = fixture('ordinary')
    const target = report.commits[2]!
    const { container } = renderCompact()

    await userEvent.click(screen.getAllByRole('button')[2]!)
    await screen.findByRole('dialog')
    expect(window.location.hash).toBe(`#${target.oid}`)

    // Widening tears the dialog down. That is the layout changing, not the
    // reader dismissing anything.
    setMediaMatch(SPLIT_LAYOUT_QUERY, true)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    expect(window.location.hash).toBe(`#${target.oid}`)
    await waitFor(() =>
      expect(container.querySelector('.details-pane__subject')?.textContent?.trim()).toBe(
        target.subject
      )
    )
    expect(container.querySelector('.commit-row--selected')).toHaveAttribute(
      'data-oid',
      target.oid
    )
  })

  it('still clears the selection when the reader dismisses the dialog with Escape', async () => {
    renderCompact()
    const row = screen.getAllByRole('button')[1]!
    await userEvent.click(row)
    const dialog = await screen.findByRole('dialog')

    // Escape raises `cancel` before the dialog closes; teardown never does.
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(window.location.hash).toBe('')
    await waitFor(() => expect(document.activeElement).toBe(row))
  })

  it('narrowing back to one column reopens the dialog on the same commit', async () => {
    const report = fixture('ordinary')
    const target = report.commits[1]!
    matchingMedia.add(SPLIT_LAYOUT_QUERY)
    render(App, { props: { report } })

    await userEvent.click(screen.getAllByRole('button')[1]!)
    setMediaMatch(SPLIT_LAYOUT_QUERY, false)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('open')
    expect(window.location.hash).toBe(`#${target.oid}`)
  })

  it('shows the empty state for an unborn branch instead of an empty timeline', () => {
    const { container } = renderSplit('empty-unborn')
    expect(container.querySelector('ol.history__list')).toBeNull()
    expect(container.textContent).toContain('has no commits yet')
    expect(screen.getByRole('region', { name: 'Commit history' })).toBeInTheDocument()
  })

  it('reports a detached HEAD and a shallow limitation truthfully', () => {
    const { container } = renderSplit('detached-shallow')
    expect(container.textContent).toContain('Detached HEAD — not on a branch')
    expect(container.textContent).toContain('shallow copy of the repository')
  })

  it('states a shallow limit and a count limit separately when both apply', () => {
    // "incomplete-history" covers both kinds of limit, so a shallow warning
    // must never stand in for the count limit.
    const report = fixture('detached-shallow')
    const combined = { ...report, selection: { ...report.selection, truncated: true } }
    matchingMedia.add(SPLIT_LAYOUT_QUERY)
    const { container } = render(App, { props: { report: combined } })

    const notices = [...container.querySelectorAll('.notice')].map((node) => node.textContent)
    expect(notices).toHaveLength(2)
    expect(notices[0]).toContain('shallow copy of the repository')
    expect(notices[1]).toContain('History continues before the oldest commit shown here.')
  })

  it('does not repeat a limitation whose wording already matches', () => {
    // ordinary is truncated and carries a warning with that exact message.
    const { container } = renderSplit('ordinary')
    const notices = [...container.querySelectorAll('.notice')].map((node) => node.textContent)
    expect(notices).toHaveLength(2)
    expect(
      notices.filter((line) => line?.includes('History continues before the oldest commit'))
    ).toHaveLength(1)
  })

  it('renders hostile repository and ref text as inert content', () => {
    const { container } = renderSplit('edge-content')
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('<script>')
  })
})
