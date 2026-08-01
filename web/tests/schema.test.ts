import { describe, expect, it } from 'vitest'
import {
  ReportStartupError,
  SUPPORTED_SCHEMA_VERSION,
  parseReport,
  parseReportJson
} from '../src/lib/schema'
import { fixture, goldenFixture } from './helpers'

function reason(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof ReportStartupError) return error.reason
    return `unexpected:${String(error)}`
  }
  return 'no-error'
}

describe('report contract', () => {
  it('accepts the Go-owned golden fixture unchanged', () => {
    const report = parseReport(goldenFixture())
    expect(report.schemaVersion).toBe(SUPPORTED_SCHEMA_VERSION)
    expect(report.commits).toHaveLength(2)
    expect(report.graph.rows.map((row) => row.commitOid)).toEqual(
      report.commits.map((commit) => commit.oid)
    )
    // The hostile golden text survives as data, byte for byte.
    expect(report.repository.name).toContain('</script>')
    expect(report.commits[0]?.parents[1]?.visibility).toBe('maximum-count-boundary')
  })

  it('accepts every web fixture', () => {
    for (const name of ['ordinary', 'dense', 'edge-content', 'empty-unborn', 'detached-shallow']) {
      const report = fixture(name)
      expect(report.selection.includedCount).toBe(report.commits.length)
      expect(report.graph.rows).toHaveLength(report.commits.length)
    }
  })

  it('rejects an unsupported schema version with a distinct reason', () => {
    const future = { ...(goldenFixture() as object), schemaVersion: 99 }
    expect(reason(() => parseReport(future))).toBe('unsupported-schema')
  })

  it('reports the version before any other structural complaint', () => {
    expect(reason(() => parseReport({ schemaVersion: 2 }))).toBe('unsupported-schema')
  })

  it('rejects malformed JSON', () => {
    expect(reason(() => parseReportJson('{ not json'))).toBe('invalid-json')
  })

  it('rejects a graph that does not line up with its commits', () => {
    const golden = goldenFixture() as { graph: { rows: unknown[] } }
    const broken = { ...golden, graph: { ...golden.graph, rows: golden.graph.rows.slice(1) } }
    expect(reason(() => parseReport(broken))).toBe('invalid-report')
  })

  it('rejects an unknown enumeration value rather than guessing', () => {
    const golden = goldenFixture() as { repository: { head: { kind: string } } }
    const broken = {
      ...golden,
      repository: { ...golden.repository, head: { ...golden.repository.head, kind: 'orphan' } }
    }
    expect(reason(() => parseReport(broken))).toBe('invalid-report')
  })

  it('treats a blank explanation as absent so no false claim is made', () => {
    const golden = goldenFixture() as { commits: Record<string, unknown>[] }
    const commits = golden.commits.map((commit) => ({ ...commit, explanation: '   \n  ' }))
    const report = parseReport({ ...golden, commits })
    expect(report.commits.every((commit) => commit.explanation === undefined)).toBe(true)
  })

  it('ignores additive unknown fields within the supported version', () => {
    const golden = goldenFixture() as object
    const report = parseReport({ ...golden, futureField: { anything: true } })
    expect(report.commits).toHaveLength(2)
  })

  it('requires the warnings array rather than assuming there were none', () => {
    const { warnings, ...withoutWarnings } = goldenFixture() as { warnings: unknown }
    expect(warnings).toBeDefined()
    expect(reason(() => parseReport(withoutWarnings))).toBe('invalid-report')
  })

  it('accepts an empty warnings array as a real statement of no limitations', () => {
    const golden = goldenFixture() as object
    expect(parseReport({ ...golden, warnings: [] }).warnings).toEqual([])
  })

  it('rejects a selection count that disagrees with the commits', () => {
    const golden = goldenFixture() as { selection: object }
    const broken = { ...golden, selection: { ...golden.selection, includedCount: 7 } }
    expect(reason(() => parseReport(broken))).toBe('invalid-report')
  })
})
