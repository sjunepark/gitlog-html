<script lang="ts">
  import CommitGraph from './CommitGraph.svelte'
  import CommitRow from './CommitRow.svelte'
  import { gutterWidth, metricsFor, type RowBox } from '../lib/geometry'
  import type { Commit, ReportGraph } from '../lib/schema'

  interface Props {
    commits: Commit[]
    graph: ReportGraph
    selectedOid: string | null
    compact: boolean
    onselect: (oid: string, element: HTMLButtonElement) => void
  }

  const { commits, graph, selectedOid, compact, onselect }: Props = $props()

  let list: HTMLOListElement | undefined = $state()
  let boxes: RowBox[] = $state([])

  const metrics = $derived(metricsFor(graph.laneCount, compact))
  const naturalWidth = $derived(gutterWidth(graph.laneCount, metrics))
  const pannable = $derived(naturalWidth > (compact ? 104 : 240))

  /**
   * Row geometry is measured rather than assumed. Explanations wrap, refs
   * wrap, and readers change their text size, so a fixed row height would
   * drift the nodes away from the commits they describe.
   */
  function measure(): void {
    const element = list
    if (element === undefined) return
    const origin = element.getBoundingClientRect().top
    const next: RowBox[] = []
    for (const item of Array.from(element.children)) {
      const rect = item.getBoundingClientRect()
      const top = rect.top - origin
      let nodeY = top + rect.height / 2
      const summary = item.querySelector('.commit-row__summary')
      if (summary instanceof HTMLElement) {
        const summaryRect = summary.getBoundingClientRect()
        const lineHeight = Number.parseFloat(getComputedStyle(summary).lineHeight)
        const firstLine = Number.isFinite(lineHeight) ? lineHeight : summaryRect.height
        nodeY = summaryRect.top - origin + Math.min(firstLine, summaryRect.height || firstLine) / 2
      }
      next.push({ top, height: rect.height, nodeY })
    }
    boxes = next
  }

  $effect(() => {
    // Re-measure when the slice or the breakpoint changes.
    void commits
    void compact
    const element = list
    if (element === undefined) return
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(element)
    for (const item of Array.from(element.children)) observer.observe(item)
    return () => observer.disconnect()
  })
</script>

<section class="history" aria-label="Commit history">
  <!--
    A gutter that has to pan becomes a keyboard-operable, named scroll region.
    A gutter that fits stays a plain container with no extra tab stop, because
    the drawing inside it is hidden from assistive technology either way.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="history__graph"
    class:history__graph--pannable={pannable}
    tabindex={pannable ? 0 : undefined}
    role={pannable ? 'group' : undefined}
    aria-label={pannable ? 'Branch graph, scroll sideways to see every line' : undefined}
  >
    <CommitGraph {graph} {commits} {boxes} {metrics} {selectedOid} />
  </div>
  <ol class="history__list" bind:this={list}>
    {#each commits as commit, index (commit.oid)}
      <li class="history__item">
        <CommitRow
          {commit}
          position={index + 1}
          total={commits.length}
          selected={commit.oid === selectedOid}
          {onselect}
        />
      </li>
    {/each}
  </ol>
</section>
