<script lang="ts">
  import BidiText from './BidiText.svelte'
  import Icon from './Icon.svelte'
  import { describeRefKind } from '../lib/format'
  import type { Ref } from '../lib/schema'

  const { ref }: { ref: Ref } = $props()

  const ICONS = {
    'local-branch': 'branch',
    'remote-branch': 'remote',
    tag: 'tag',
    other: 'reference'
  } as const
</script>

<!--
  Ref kind is carried by an icon, a border treatment, and text that screen
  readers announce. Colour is never the only signal.
-->
<span class="ref ref--{ref.kind}" class:ref--head={ref.isHead}>
  <Icon name={ICONS[ref.kind]} class="ref__icon" />
  <span class="visually-hidden">{describeRefKind(ref)}{ref.isHead ? ', currently checked out' : ''}:</span>
  <span class="ref__name"><BidiText text={ref.displayName} /></span>
  {#if ref.isHead}
    <span class="ref__head-mark" aria-hidden="true">HEAD</span>
  {/if}
</span>
