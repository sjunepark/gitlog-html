<script lang="ts">
  /**
   * One drawn icon set at a single stroke weight. Icons are authored here
   * rather than pulled from a font or an image so the report keeps its
   * no-external-resource guarantee.
   */
  type IconName = 'branch' | 'remote' | 'tag' | 'reference' | 'close' | 'notice' | 'arrow'

  const { name, class: className = '' }: { name: IconName; class?: string } = $props()
</script>

<svg
  class="icon {className}"
  viewBox="0 0 16 16"
  width="16"
  height="16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'branch'}
    <path d="M5 4.5v7" />
    <circle cx="5" cy="3" r="1.6" />
    <circle cx="5" cy="13" r="1.6" />
    <circle cx="11.5" cy="4.5" r="1.6" />
    <path d="M11.5 6.1v1.2a2.6 2.6 0 0 1-2.6 2.6H5" />
  {:else if name === 'remote'}
    <rect x="2.25" y="2.75" width="11.5" height="4.25" rx="1" />
    <rect x="2.25" y="9" width="11.5" height="4.25" rx="1" />
    <path d="M4.75 4.875h.01M4.75 11.125h.01" />
  {:else if name === 'tag'}
    <path d="M7.6 2.25H3.4a1.15 1.15 0 0 0-1.15 1.15v4.2c0 .3.12.6.34.81l5.2 5.2a1.15 1.15 0 0 0 1.63 0l4.2-4.2a1.15 1.15 0 0 0 0-1.63l-5.2-5.2a1.15 1.15 0 0 0-.81-.33Z" />
    <path d="M5.15 5.15h.01" />
  {:else if name === 'reference'}
    <path d="M8 2.4 13.6 8 8 13.6 2.4 8Z" />
  {:else if name === 'close'}
    <path d="m4.25 4.25 7.5 7.5m0-7.5-7.5 7.5" />
  {:else if name === 'arrow'}
    <path d="M3 8h10M9.25 4.25 13 8l-3.75 3.75" />
  {:else if name === 'notice'}
    <path d="M8 2.75 14.4 13.4H1.6Z" />
    <path d="M8 6.6v3.1M8 11.6h.01" />
  {/if}
</svg>
