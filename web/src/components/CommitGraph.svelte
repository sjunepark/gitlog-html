<script lang="ts">
  import { buildGraphGeometry, isRelatedEdge, type GraphMetrics, type RowBox } from '../lib/geometry'
  import type { Commit, ReportGraph } from '../lib/schema'

  interface Props {
    graph: ReportGraph
    commits: Commit[]
    boxes: RowBox[]
    metrics: GraphMetrics
    selectedOid: string | null
  }

  const { graph, commits, boxes, metrics, selectedOid }: Props = $props()

  const geometry = $derived(buildGraphGeometry(graph, commits, boxes, metrics))

  /** The selected row's tint continues across the gutter as one band. */
  const band = $derived.by(() => {
    if (selectedOid === null) return null
    const index = graph.rows.findIndex((row) => row.commitOid === selectedOid)
    return index < 0 ? null : (boxes[index] ?? null)
  })

  /** Lane colours repeat; they separate simultaneous lanes and nothing more. */
  const LANE_COLOURS = 6
  function laneClass(lane: number): string {
    return `lane-${lane % LANE_COLOURS}`
  }

  function chevron(x: number, y: number): string {
    return `M${x - 3.2} ${y - 1.6}L${x} ${y + 1.8}L${x + 3.2} ${y - 1.6}`
  }
</script>

<!--
  The SVG is decoration over semantics: every relationship it draws is also
  present in the commit buttons and the details pane, so it is hidden from
  assistive technology rather than duplicated into a confusing parallel tree.
-->
<svg
  class="graph"
  width={geometry.width}
  height={geometry.height}
  viewBox="0 0 {geometry.width} {geometry.height}"
  aria-hidden="true"
  focusable="false"
>
  {#if band !== null}
    <rect class="graph__band" x="0" y={band.top} width={geometry.width} height={band.height} />
  {/if}
  <g class="graph__edges">
    {#each geometry.edges as edge (edge.key)}
      <path
        class="edge {laneClass(edge.lane)}"
        class:edge--boundary={edge.boundary !== undefined}
        class:edge--related={isRelatedEdge(edge, selectedOid)}
        d={edge.d}
      />
    {/each}
  </g>
  <g class="graph__marks">
    {#each geometry.boundaries as boundary (boundary.key)}
      <!-- Truncated history continues past the slice; it is never a root. -->
      <path class="boundary-glyph {laneClass(boundary.lane)}" d={chevron(boundary.x, boundary.y)} />
    {/each}
    {#each geometry.roots as root (root.key)}
      <!-- A true root ends with a flat cap, visibly unlike the chevron. -->
      <path class="root-cap {laneClass(root.lane)}" d="M{root.x - 4.5} {root.y}H{root.x + 4.5}" />
    {/each}
  </g>
  <g class="graph__nodes">
    {#each geometry.nodes as node (node.commitOid)}
      <circle class="node__halo" cx={node.x} cy={node.y} r={node.radius + 2.75} />
      {#if node.commitOid === selectedOid}
        <circle class="node__ring" cx={node.x} cy={node.y} r={node.radius + 3.5} />
      {/if}
      <circle
        class="node node--{node.shape} {laneClass(node.lane)}"
        class:node--selected={node.commitOid === selectedOid}
        cx={node.x}
        cy={node.y}
        r={node.radius}
      />
    {/each}
  </g>
</svg>
