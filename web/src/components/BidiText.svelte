<script lang="ts">
  import { segmentBidiControls } from '../lib/format'

  const { text }: { text: string } = $props()

  const segments = $derived(segmentBidiControls(text))
</script>

<!--
  Untrusted text, rendered so it cannot lie about its own order.

  Each bidi formatting control is kept verbatim but placed alone inside an
  isolate, so an override has no following characters left to reorder and
  cannot reach the text on either side of it. The visible badge comes from a
  CSS pseudo-element and the spoken name from `aria-label`, so neither reaches
  `textContent`: the DOM, a selection, and a copy all still carry exactly the
  code points Git recorded. Everything is interpolated as text; no markup is
  ever produced from repository content.

  The whole template is written without stray whitespace on purpose — a single
  space between segments would corrupt the message it is showing.
-->
{#each segments as segment, index (index)}{#if segment.control}<span
    class="bidi-mark"
    role="img"
    aria-label="Bidirectional control: {segment.label}"
    data-mark={segment.mark}>{segment.value}</span>{:else}{segment.value}{/if}{/each}
