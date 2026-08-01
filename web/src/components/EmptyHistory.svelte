<script lang="ts">
  import type { Report } from '../lib/schema'

  const { report }: { report: Report } = $props()

  const head = $derived(report.repository.head)
</script>

<section class="empty" aria-label="Commit history">
  {#if head.kind === 'unborn'}
    <p class="empty__lead">
      Branch <span class="empty__branch">{head.branch ?? ''}</span> has no commits yet.
    </p>
    <p class="empty__note">
      The repository exists, but nothing has been recorded on this branch. A report will show
      history as soon as the first commit is made.
    </p>
  {:else}
    <p class="empty__lead">This report covers no commits.</p>
    <p class="empty__note">
      {report.selection.scope === 'current'
        ? 'The current branch has no commits in the selected range.'
        : 'No commits were found in the repository.'}
    </p>
  {/if}
</section>
