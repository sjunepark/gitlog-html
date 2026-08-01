/**
 * Converts the Go-owned logical lane layout into responsive SVG coordinates.
 *
 * This module owns pixels only. Lane assignment, parent order, relationship
 * kind, and boundary classification all arrive from the report and are never
 * recomputed here; changing a lane index in this file would make the drawing
 * disagree with the report data.
 */

import type { Commit, ParentVisibility, ReportGraph, RelationshipKind } from './schema'

export interface GraphMetrics {
  /** Horizontal distance between adjacent lane centres. */
  lanePitch: number
  /** Distance from the gutter's left edge to lane 0's centre. */
  laneInset: number
  /** Trailing space after the last lane centre. */
  laneOutset: number
  nodeRadius: number
  /** Vertical travel of a boundary stub before its continuation glyph. */
  boundaryReach: number
}

export const DESKTOP_METRICS: GraphMetrics = {
  lanePitch: 18,
  laneInset: 13,
  laneOutset: 15,
  nodeRadius: 4.5,
  boundaryReach: 26
}

export const COMPACT_METRICS: GraphMetrics = {
  lanePitch: 14,
  laneInset: 11,
  laneOutset: 11,
  nodeRadius: 4,
  boundaryReach: 20
}

/**
 * Gutter width each breakpoint can spend before the graph has to pan.
 *
 * These are the single source of truth for the gutter: `app.css` pins
 * `--graph-gutter-max` to the same pixel values, and a stylesheet test keeps
 * the two in step. They are pixels, not `rem`, because the gutter holds a
 * drawing whose lane pitch is measured in pixels — growing it with the reader's
 * text size would take width from the commit text without adding any lanes.
 */
export const SPLIT_GUTTER = 240
export const COMPACT_GUTTER = 104
const DESKTOP_BUDGET = SPLIT_GUTTER
const COMPACT_BUDGET = COMPACT_GUTTER
const DESKTOP_MIN_PITCH = 12
const COMPACT_MIN_PITCH = 11

/**
 * Chooses a lane pitch for the slice's actual density.
 *
 * Tightening the pitch keeps a busy history inside its gutter so commit text
 * is never crushed; below the minimum pitch the lanes would stop being
 * separable, so the graph pans horizontally instead of compressing further.
 */
export function metricsFor(laneCount: number, compact: boolean): GraphMetrics {
  const base = compact ? COMPACT_METRICS : DESKTOP_METRICS
  const budget = compact ? COMPACT_BUDGET : DESKTOP_BUDGET
  const minimum = compact ? COMPACT_MIN_PITCH : DESKTOP_MIN_PITCH
  if (laneCount <= 1) return base
  const available = budget - base.laneInset - base.laneOutset
  const fitted = Math.floor(available / (laneCount - 1))
  const pitch = Math.max(minimum, Math.min(base.lanePitch, fitted))
  return { ...base, lanePitch: pitch }
}

/** A measured commit row. All values are in the graph's own coordinate space. */
export interface RowBox {
  top: number
  height: number
  /** Vertical centre of the row's node, aligned with its first line of text. */
  nodeY: number
}

export type NodeShape = 'commit' | 'merge' | 'root'

export interface GraphNode {
  commitOid: string
  x: number
  y: number
  lane: number
  shape: NodeShape
  radius: number
}

export interface GraphEdge {
  /** Stable key for keyed rendering. */
  key: string
  d: string
  /** Lane whose colour the stroke uses; topology never depends on it. */
  lane: number
  kind: RelationshipKind | 'arrival'
  /** Object ID of the commit whose row emitted this edge. */
  commitOid: string
  parentOid?: string
  boundary?: ParentVisibility
}

export interface BoundaryGlyph {
  key: string
  x: number
  y: number
  lane: number
  commitOid: string
  boundary: ParentVisibility
}

export interface RootCap {
  key: string
  x: number
  y: number
  lane: number
  commitOid: string
}

export interface GraphGeometry {
  width: number
  height: number
  nodes: GraphNode[]
  edges: GraphEdge[]
  boundaries: BoundaryGlyph[]
  roots: RootCap[]
}

export function laneX(lane: number, metrics: GraphMetrics): number {
  return metrics.laneInset + lane * metrics.lanePitch
}

export function gutterWidth(laneCount: number, metrics: GraphMetrics): number {
  if (laneCount <= 0) return 0
  return laneX(laneCount - 1, metrics) + metrics.laneOutset
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Vertical segment. A same-lane edge stays perfectly straight so first-parent
 * continuity reads as one uninterrupted line.
 */
function segment(x0: number, y0: number, x1: number, y1: number): string {
  if (Math.abs(x1 - x0) < 0.01) {
    return `M${round(x0)} ${round(y0)}V${round(y1)}`
  }
  // Restrained S-curve: the horizontal move happens in the middle of the
  // vertical travel so lane changes read as a deliberate crossing rather than
  // a diagonal shortcut.
  const bend = (y1 - y0) * 0.5
  return (
    `M${round(x0)} ${round(y0)}` +
    `C${round(x0)} ${round(y0 + bend)},${round(x1)} ${round(y1 - bend)},${round(x1)} ${round(y1)}`
  )
}

function nodeShape(commit: Commit | undefined): NodeShape {
  if (commit === undefined) return 'commit'
  if (commit.parents.length >= 2) return 'merge'
  if (commit.parents.length === 0) return 'root'
  return 'commit'
}

/**
 * Builds every stroke and node for the visible slice.
 *
 * Rows must be measured in document order and match the report's graph rows.
 * A row without a measurement is skipped rather than guessed, so a partially
 * measured first frame draws nothing instead of drawing something untrue.
 */
export function buildGraphGeometry(
  graph: ReportGraph,
  commits: Commit[],
  rows: RowBox[],
  metrics: GraphMetrics
): GraphGeometry {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const boundaries: BoundaryGlyph[] = []
  const roots: RootCap[] = []

  const commitsByOid = new Map(commits.map((commit) => [commit.oid, commit]))
  let height = 0

  graph.rows.forEach((row, index) => {
    const box = rows[index]
    if (box === undefined) return
    const top = box.top
    const bottom = box.top + box.height
    const nodeY = box.nodeY
    height = Math.max(height, bottom)

    const nodeXValue = laneX(row.nodeLane, metrics)
    const commit = commitsByOid.get(row.commitOid)

    // The stroke arriving from the previous row into this node. The report
    // omits it as a transition because the lane simply resolves here.
    const arriving = row.incoming[row.nodeLane]
    if (arriving?.expectedOid === row.commitOid) {
      edges.push({
        key: `${row.commitOid}:arrival`,
        d: segment(nodeXValue, top, nodeXValue, nodeY),
        lane: row.nodeLane,
        kind: 'arrival',
        commitOid: row.commitOid
      })
    }

    row.transitions.forEach((transition, transitionIndex) => {
      const fromX = laneX(transition.fromLane, metrics)
      const toX = laneX(transition.toLane, metrics)
      const key = `${row.commitOid}:${transitionIndex}`

      if (transition.kind === 'continuation') {
        edges.push({
          key,
          d: segment(fromX, top, toX, bottom),
          lane: transition.toLane,
          kind: 'continuation',
          commitOid: row.commitOid
        })
        return
      }

      if (transition.boundary !== undefined) {
        // A boundary edge leaves the node and stops inside the row: drawing it
        // to the bottom would imply a parent row that does not exist.
        const reach = Math.min(metrics.boundaryReach, Math.max(12, (bottom - nodeY) * 0.7))
        // The floor of 12 keeps a short stub readable, but a very short row
        // must still contain it: crossing into the next row would draw a
        // relationship that does not exist.
        const endY = Math.min(nodeY + reach, bottom - 2)
        const edge: GraphEdge = {
          key,
          d: segment(nodeXValue, nodeY, toX, endY),
          lane: transition.toLane,
          kind: transition.kind,
          commitOid: row.commitOid,
          boundary: transition.boundary
        }
        if (transition.parentOid !== undefined) edge.parentOid = transition.parentOid
        edges.push(edge)
        boundaries.push({
          key: `${key}:glyph`,
          x: toX,
          y: endY,
          lane: transition.toLane,
          commitOid: row.commitOid,
          boundary: transition.boundary
        })
        return
      }

      const edge: GraphEdge = {
        key,
        d: segment(nodeXValue, nodeY, toX, bottom),
        lane: transition.toLane,
        kind: transition.kind,
        commitOid: row.commitOid
      }
      if (transition.parentOid !== undefined) edge.parentOid = transition.parentOid
      edges.push(edge)
    })

    const shape = nodeShape(commit)
    nodes.push({
      commitOid: row.commitOid,
      x: nodeXValue,
      y: nodeY,
      lane: row.nodeLane,
      shape,
      radius: shape === 'merge' ? metrics.nodeRadius + 1 : metrics.nodeRadius
    })

    if (shape === 'root') {
      // A true root ends history. Its flat cap is deliberately different from
      // the dashed boundary glyph so truncation is never mistaken for a start.
      roots.push({
        key: `${row.commitOid}:root`,
        x: nodeXValue,
        y: Math.min(nodeY + metrics.nodeRadius + 7, bottom - 2),
        lane: row.nodeLane,
        commitOid: row.commitOid
      })
    }
  })

  return {
    width: gutterWidth(graph.laneCount, metrics),
    height,
    nodes,
    edges,
    boundaries,
    roots
  }
}

/**
 * Emphasises the strokes that leave the selected commit and the strokes that
 * point at it, so a reader can trace both directions of a selection without
 * relying on colour.
 */
export function isRelatedEdge(edge: GraphEdge, selectedOid: string | null): boolean {
  if (selectedOid === null) return false
  return edge.commitOid === selectedOid || edge.parentOid === selectedOid
}
