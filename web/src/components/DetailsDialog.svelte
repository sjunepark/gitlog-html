<script lang="ts">
  import BidiText from './BidiText.svelte'
  import CommitDetails from './CommitDetails.svelte'
  import Icon from './Icon.svelte'
  import { commitTitle } from '../lib/format'
  import type { Commit } from '../lib/schema'

  interface Props {
    commit: Commit
    commits: Commit[]
    onclose: () => void
    onselectparent: (oid: string) => void
  }

  const { commit, commits, onclose, onselectparent }: Props = $props()

  const uid = $props.id()

  let dialog: HTMLDialogElement | undefined = $state()
  let panel: HTMLDivElement | undefined = $state()

  const title = $derived(commitTitle(commit))

  /**
   * A native modal dialog gives focus containment, Escape handling, and the
   * top layer without reimplementing any of them.
   */
  $effect(() => {
    const element = dialog
    if (element === undefined) return
    if (!element.open && typeof element.showModal === 'function') {
      element.showModal()
      panel?.focus()
    }
    return () => {
      if (element.open) element.close()
    }
  })

  export function focusPanel(): void {
    panel?.focus()
  }

  function onBackdrop(event: MouseEvent): void {
    if (event.target === dialog) onclose()
  }

  /**
   * `cancel` is the platform's signal that the reader asked to dismiss the
   * dialog — Escape raises it, a programmatic `close()` does not. Listening for
   * `close` instead would treat teardown as dismissal, so widening the viewport
   * past the split-layout breakpoint would silently drop the selection and the
   * URL fragment while the reader was still looking at that commit.
   */
  function onCancel(): void {
    onclose()
  }
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  aria-labelledby="{uid}-title"
  oncancel={onCancel}
  onclick={onBackdrop}
>
  <div class="sheet__panel" bind:this={panel} tabindex="-1">
    <div class="sheet__head">
      <h2 class="sheet__title" id="{uid}-title"><BidiText text={title} /></h2>
      <button type="button" class="sheet__close" onclick={onclose}>
        <Icon name="close" class="sheet__close-icon" />
        Close
      </button>
    </div>
    <div class="sheet__body">
      <CommitDetails {commit} {commits} {onselectparent} />
    </div>
  </div>
</dialog>
