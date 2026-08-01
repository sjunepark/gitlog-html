<script lang="ts">
  import type { StartupFailureReason } from '../lib/schema'

  const { reason, detail }: { reason: StartupFailureReason; detail: string } = $props()

  const EXPLANATIONS: Record<StartupFailureReason, string> = {
    'missing-data':
      'This file does not contain the history data the viewer expects. It may have been edited or only partly saved.',
    'invalid-json':
      'The history data inside this file could not be read. It may have been edited or damaged in transit.',
    'unsupported-schema':
      'This file was produced in a report format this viewer does not understand. Open it with a matching version of gitlog-html, or generate the report again.',
    'invalid-report':
      'The history data inside this file is incomplete or inconsistent, so showing it could misrepresent the repository.'
  }
</script>

<!--
  A failed startup states what happened instead of leaving an empty page.
  Nothing here depends on the report data, so it works even when that data is
  the problem.
-->
<div class="failure" role="alert">
  <h1 class="failure__title">This report could not be opened</h1>
  <p class="failure__text">{EXPLANATIONS[reason]}</p>
  <p class="failure__detail"><span class="oid">{detail}</span></p>
</div>
