import { describe, expect, it } from 'vitest'
import {
  COMPACT_METRICS,
  DESKTOP_METRICS,
  buildGraphGeometry,
  gutterWidth,
  isRelatedEdge,
  laneX,
  metricsFor,
  type RowBox
} from '../src/lib/geometry'
import { fixture } from './helpers'

function boxes(count: number, height = 60): RowBox[] {
  return Array.from({ length: count }, (_, index) => ({
    top: index * height,
    height,
    nodeY: index * height + 20
  }))
}

describe('lane geometry', () => {
  it('places lanes at an even pitch from the gutter inset', () => {
    expect(laneX(0, DESKTOP_METRICS)).toBe(DESKTOP_METRICS.laneInset)
    expect(laneX(3, DESKTOP_METRICS)).toBe(DESKTOP_METRICS.laneInset + 3 * DESKTOP_METRICS.lanePitch)
    expect(gutterWidth(0, DESKTOP_METRICS)).toBe(0)
  })

  it('tightens the pitch for dense slices instead of crushing commit text', () => {
    expect(metricsFor(2, true).lanePitch).toBe(COMPACT_METRICS.lanePitch)
    expect(metricsFor(10, true).lanePitch).toBeLessThan(COMPACT_METRICS.lanePitch)
  })

  it('stops tightening at a readable minimum and lets the graph pan instead', () => {
    const compact = metricsFor(24, true)
    expect(compact.lanePitch).toBe(11)
    expect(gutterWidth(24, compact)).toBeGreaterThan(104)
  })
})

describe('graph geometry from the report layout', () => {
  const report = fixture('ordinary')
  const geometry = buildGraphGeometry(
    report.graph,
    report.commits,
    boxes(report.commits.length),
    DESKTOP_METRICS
  )

  it('draws one node per commit, in the lane the report assigned', () => {
    expect(geometry.nodes).toHaveLength(report.commits.length)
    geometry.nodes.forEach((node, index) => {
      expect(node.commitOid).toBe(report.graph.rows[index]?.commitOid)
      expect(node.x).toBe(laneX(report.graph.rows[index]?.nodeLane ?? 0, DESKTOP_METRICS))
    })
  })

  it('marks merge commits with their own node shape', () => {
    const merge = geometry.nodes.find((node) => node.commitOid === report.commits[0]?.oid)
    expect(merge?.shape).toBe('merge')
    const ordinary = geometry.nodes.find((node) => node.commitOid === report.commits[1]?.oid)
    expect(ordinary?.shape).toBe('commit')
  })

  it('draws every transition the report describes, plus the arrival stroke', () => {
    const transitions = report.graph.rows.reduce((total, row) => total + row.transitions.length, 0)
    const arrivals = report.graph.rows.filter(
      (row) => row.incoming[row.nodeLane]?.expectedOid === row.commitOid
    ).length
    expect(geometry.edges).toHaveLength(transitions + arrivals)
  })

  it('ends a truncated parent inside its row and marks it with a glyph', () => {
    const lastRow = report.graph.rows.at(-1)
    const boundary = geometry.boundaries.find((item) => item.commitOid === lastRow?.commitOid)
    expect(boundary?.boundary).toBe('maximum-count-boundary')
    const edge = geometry.edges.find(
      (item) => item.commitOid === lastRow?.commitOid && item.boundary !== undefined
    )
    // A boundary stroke must not reach the bottom of its row, which would
    // imply a parent row below it.
    const rowBottom = boxes(report.commits.length).at(-1)
    expect(edge?.d).toBeDefined()
    expect(boundary!.y).toBeLessThan((rowBottom?.top ?? 0) + (rowBottom?.height ?? 0))
  })

  it('caps a true root instead of fading it like a truncation', () => {
    const edge = fixture('edge-content')
    const rooted = buildGraphGeometry(
      edge.graph,
      edge.commits,
      boxes(edge.commits.length),
      DESKTOP_METRICS
    )
    expect(rooted.roots).toHaveLength(1)
    expect(rooted.roots[0]?.commitOid).toBe(edge.commits.at(-1)?.oid)
    expect(rooted.boundaries).toHaveLength(0)
  })

  it('never draws a row it has no measurement for', () => {
    const partial = buildGraphGeometry(report.graph, report.commits, boxes(2), DESKTOP_METRICS)
    expect(partial.nodes).toHaveLength(2)
  })

  it('relates the strokes that leave the selection and the strokes aimed at it', () => {
    const selected = report.commits[1]!.oid
    const related = geometry.edges.filter((edge) => isRelatedEdge(edge, selected))
    expect(related.length).toBeGreaterThan(0)
    expect(
      related.every((edge) => edge.commitOid === selected || edge.parentOid === selected)
    ).toBe(true)
    expect(geometry.edges.some((edge) => isRelatedEdge(edge, null))).toBe(false)
  })

  it('keeps a same-lane stroke perfectly vertical', () => {
    const straight = geometry.edges.find((edge) => edge.kind === 'arrival')
    expect(straight?.d).toMatch(/^M[\d.]+ [\d.]+V[\d.]+$/)
  })
})
