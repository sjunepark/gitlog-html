<script lang="ts">
  import CommitDetails from './CommitDetails.svelte'
  import DetailsDialog from './DetailsDialog.svelte'
  import EmptyHistory from './EmptyHistory.svelte'
  import HistoryView from './HistoryView.svelte'
  import ReportHeader from './ReportHeader.svelte'
  import { tick } from 'svelte'
  import { commitTitle, summaryText } from '../lib/format'
  import { MediaQuery, SPLIT_LAYOUT_QUERY } from '../lib/media.svelte'
  import { CommitSelection } from '../lib/selection.svelte'
  import type { Report } from '../lib/schema'

  const { report }: { report: Report } = $props()

  // The report is embedded in the document and never replaced, so reading it
  // once at construction is the intended behaviour.
  // svelte-ignore state_referenced_locally
  const selection = new CommitSelection(report.commits.map((commit) => commit.oid))
  const splitLayout = new MediaQuery(SPLIT_LAYOUT_QUERY, true)

  let dialog: ReturnType<typeof DetailsDialog> | undefined = $state()

  /** The control that opened details, so closing can hand focus back to it. */
  let invoker: HTMLElement | null = null

  const selected = $derived(report.commits.find((commit) => commit.oid === selection.oid) ?? null)
  const showDialog = $derived(!splitLayout.matches && selected !== null)

  $effect(() => selection.listen())
  $effect(() => splitLayout.listen())

  function rowButton(oid: string): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(`.commit-row[data-oid="${CSS.escape(oid)}"]`)
  }

  function onSelectCommit(oid: string, element: HTMLButtonElement): void {
    invoker = element
    selection.select(oid)
  }

  /**
   * Following a parent keeps focus somewhere meaningful: inside the modal on
   * a phone, and on the newly selected commit on a wide screen.
   */
  // `tick()` states the dependency outright: focus can only move once the
  // selection change has been applied to the DOM.
  async function onSelectParent(oid: string): Promise<void> {
    const modal = showDialog
    selection.select(oid)
    await tick()
    const button = rowButton(oid)
    if (button !== null) invoker = button
    if (modal) dialog?.focusPanel()
    else button?.focus()
  }

  async function onCloseDetails(): Promise<void> {
    const target = invoker
    selection.clear()
    await tick()
    if (target !== null && target.isConnected) target.focus()
  }
</script>

<div class="report">
  <ReportHeader {report} />

  {#if report.commits.length === 0}
    <EmptyHistory {report} />
  {:else}
    <div class="report__body" class:report__body--split={splitLayout.matches}>
      <HistoryView
        commits={report.commits}
        graph={report.graph}
        selectedOid={selection.oid}
        compact={!splitLayout.matches}
        onselect={onSelectCommit}
      />

      {#if splitLayout.matches}
        <aside class="details-pane" aria-label="Commit details">
          {#if selected !== null}
            {#key selected.oid}
              <p class="details-pane__subject">{commitTitle(selected)}</p>
              <CommitDetails
                commit={selected}
                commits={report.commits}
                onselectparent={onSelectParent}
              />
            {/key}
          {:else}
            <p class="details-pane__hint">
              Choose a commit to read what changed and why.
            </p>
          {/if}
        </aside>
        <!--
          One short, polite announcement per selection. The details region is
          not a live region, which would narrate every metadata line again.
        -->
        <p class="visually-hidden" role="status">
          {selected === null ? '' : `Showing details for ${summaryText(selected)}`}
        </p>
      {/if}
    </div>
  {/if}
</div>

{#if showDialog && selected !== null}
  <DetailsDialog
    bind:this={dialog}
    commit={selected}
    commits={report.commits}
    onclose={onCloseDetails}
    onselectparent={onSelectParent}
  />
{/if}
