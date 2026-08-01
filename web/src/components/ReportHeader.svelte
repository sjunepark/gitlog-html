<script lang="ts">
  import Icon from './Icon.svelte'
  import { describeHead, describeScope, formatDateTime, machineDateTime } from '../lib/format'
  import type { Report } from '../lib/schema'

  const { report }: { report: Report } = $props()

  const head = $derived(report.repository.head)

  /** Detached HEAD reads better with the same short ID the timeline shows. */
  const detachedAt = $derived.by(() => {
    if (head.kind !== 'detached' || head.oid === undefined) return null
    const match = report.commits.find((commit) => commit.oid === head.oid)
    return match?.abbreviatedOid ?? head.oid
  })

  const COUNT_LIMIT_NOTICE = 'History continues before the oldest commit shown here.'

  /**
   * Every limitation is stated on its own terms.
   *
   * "incomplete-history" covers both a shallow clone and a count limit, so the
   * presence of that code cannot stand in for the count limit: a shallow
   * repository that is also truncated would otherwise lose one of its two
   * limitations. Only byte-identical messages collapse, which keeps the common
   * case from repeating itself.
   */
  const notices = $derived.by(() => {
    const lines = report.warnings.map((warning) => warning.message)
    if (report.selection.truncated) lines.push(COUNT_LIMIT_NOTICE)
    return [...new Set(lines)]
  })
</script>

<header class="report-header">
  <h1 class="report-header__name">{report.repository.name}</h1>
  <p class="report-header__scope">
    <span class="report-header__head">
      {describeHead(head)}{#if detachedAt !== null}<span class="report-header__oid">{detachedAt}</span>{/if}
    </span>
    <span class="report-header__divider" aria-hidden="true"></span>
    <span>{describeScope(report.selection)}</span>
  </p>
  <p class="report-header__generated">
    Generated
    <time datetime={machineDateTime(report.generatedAt)}>{formatDateTime(report.generatedAt)}</time>
  </p>

  {#if notices.length > 0}
    <!--
      Truncation and shallow clones are stated plainly. The report never
      silently presents a partial history as if it were complete.
    -->
    <ul class="notices">
      {#each notices as notice, index (index)}
        <li class="notice">
          <Icon name="notice" class="notice__icon" />
          <span>{notice}</span>
        </li>
      {/each}
    </ul>
  {/if}
</header>
