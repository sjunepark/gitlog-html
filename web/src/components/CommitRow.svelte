<script lang="ts">
  import BidiText from './BidiText.svelte'
  import RefLabel from './RefLabel.svelte'
  import { commitAccessibleLabel, formatDate, formatTime, machineDateTime, summaryText } from '../lib/format'
  import type { Commit } from '../lib/schema'

  interface Props {
    commit: Commit
    position: number
    total: number
    selected: boolean
    onselect: (oid: string, element: HTMLButtonElement) => void
  }

  const { commit, position, total, selected, onselect }: Props = $props()

  let button: HTMLButtonElement | undefined = $state()

  const summary = $derived(summaryText(commit))
  const label = $derived(commitAccessibleLabel(commit, position, total))
</script>

<!--
  One native button per commit. Pointer, touch, Enter, and Space all work
  without extra key handling, and the accessible name repeats what the graph
  shows so the SVG can stay hidden from assistive technology.
-->
<button
  bind:this={button}
  type="button"
  class="commit-row"
  class:commit-row--selected={selected}
  aria-current={selected ? 'true' : undefined}
  aria-label={label}
  data-oid={commit.oid}
  onclick={() => button && onselect(commit.oid, button)}
>
  <span class="commit-row__when">
    <time class="commit-row__date" datetime={machineDateTime(commit.committer.when)}>
      {formatDate(commit.committer.when)}
    </time>
    <span class="commit-row__time">{formatTime(commit.committer.when)}</span>
  </span>
  <span class="commit-row__summary"><BidiText text={summary} /></span>
  {#if commit.refs.length > 0}
    <span class="commit-row__refs">
      {#each commit.refs as ref (ref.fullName)}
        <RefLabel {ref} />
      {/each}
    </span>
  {/if}
  <span class="commit-row__oid">{commit.abbreviatedOid}</span>
</button>
