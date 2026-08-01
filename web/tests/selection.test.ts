import { describe, expect, it } from 'vitest'
import { CommitSelection, readFragment } from '../src/lib/selection.svelte'
import { fixture } from './helpers'

const oids = fixture('ordinary').commits.map((commit) => commit.oid)
const first = oids[0]!
const second = oids[1]!

describe('fragment-backed selection', () => {
  it('starts empty when the file is opened without a fragment', () => {
    const selection = new CommitSelection(oids)
    expect(selection.oid).toBeNull()
    expect(selection.hasSelection).toBe(false)
  })

  it('initialises from a valid full object ID', () => {
    window.location.hash = first
    expect(new CommitSelection(oids).oid).toBe(first)
  })

  it('ignores an unknown fragment without failing', () => {
    window.location.hash = 'not-a-commit'
    expect(new CommitSelection(oids).oid).toBeNull()
  })

  it('ignores an abbreviated ID: selection is by full object ID only', () => {
    window.location.hash = first.slice(0, 12)
    expect(new CommitSelection(oids).oid).toBeNull()
  })

  it('survives a malformed percent escape in the fragment', () => {
    window.location.hash = '%E0%A4%A'
    expect(() => readFragment()).not.toThrow()
    expect(new CommitSelection(oids).oid).toBeNull()
  })

  it('writes the full object ID to the fragment when a commit is chosen', () => {
    const selection = new CommitSelection(oids)
    selection.select(second)
    expect(selection.oid).toBe(second)
    expect(window.location.hash).toBe(`#${second}`)
  })

  it('refuses a commit that is not in this report', () => {
    const selection = new CommitSelection(oids)
    selection.select('ffffffffffffffffffffffffffffffffffffffff')
    expect(selection.oid).toBeNull()
  })

  it('clears the fragment when the reader closes details', () => {
    const selection = new CommitSelection(oids)
    selection.select(first)
    selection.clear()
    expect(selection.oid).toBeNull()
    expect(window.location.hash).toBe('')
  })

  it('follows browser navigation back to another commit', () => {
    const selection = new CommitSelection(oids)
    selection.select(first)
    window.location.hash = second
    selection.syncFromLocation()
    expect(selection.oid).toBe(second)
  })

  it('detaches its navigation listeners on request', () => {
    const selection = new CommitSelection(oids)
    const stop = selection.listen()
    window.location.hash = first
    window.dispatchEvent(new Event('hashchange'))
    expect(selection.oid).toBe(first)
    stop()
    window.location.hash = second
    window.dispatchEvent(new Event('hashchange'))
    expect(selection.oid).toBe(first)
  })
})
