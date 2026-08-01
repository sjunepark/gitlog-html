<script lang="ts">
  import App from './App.svelte'
  import ReportFailure from './ReportFailure.svelte'
  import type { Report } from '../lib/schema'

  interface Props {
    report: Report
    /** Last resort: the failure UI itself could not render. */
    onfatal: (error: unknown) => void
  }

  const { report, onfatal }: Props = $props()

  function detail(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
</script>

<!--
  Two tiers, because there are two things that can fail.

  `mount()` returns before the first effects run, so a try/catch around it
  cannot see an error raised while the tree renders or while an effect runs.
  The inner boundary can, and it answers with the report-failure view.

  If that view is itself what breaks, Svelte propagates the error out of the
  failed snippet to the next boundary up. Without the outer one there is no
  next boundary and the error escapes as an unhandled rejection, leaving the
  reader a blank page. The outer boundary catches that second failure and hands
  it to `onfatal`, which renders the imperative plain-DOM message — the only
  tier left that does not depend on Svelte rendering anything at all.

  Neither boundary calls `reset`: the report data is static and already parsed,
  so there is nothing a retry could do differently.
-->
<svelte:boundary onerror={onfatal}>
  <svelte:boundary>
    <App {report} />

    {#snippet failed(error)}
      <ReportFailure reason="invalid-report" detail={detail(error)} />
    {/snippet}
  </svelte:boundary>
</svelte:boundary>
