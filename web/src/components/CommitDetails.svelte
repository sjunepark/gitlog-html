<script lang="ts">
  import Icon from './Icon.svelte'
  import RefLabel from './RefLabel.svelte'
  import {
    authorDiffersFromCommitter,
    boundaryLabel,
    formatDateTime,
    machineDateTime,
    personText,
    summaryText
  } from '../lib/format'
  import type { Commit } from '../lib/schema'

  type Mode = 'explanation' | 'raw'

  interface Props {
    commit: Commit
    commits: Commit[]
    onselectparent: (oid: string) => void
  }

  const { commit, commits, onselectparent }: Props = $props()

  const uid = $props.id()

  // Holding the request against its commit resets the view to the explanation
  // whenever the reader moves to a different commit, without an effect that
  // writes state it also reads.
  let requested = $state<{ oid: string; mode: Mode } | null>(null)

  const hasExplanation = $derived(commit.explanation !== undefined)
  const mode = $derived<Mode>(
    !hasExplanation ? 'raw' : requested?.oid === commit.oid ? requested.mode : 'explanation'
  )

  /** Plain text only: paragraphs are split, and nothing is ever parsed as markup. */
  const paragraphs = $derived(
    (commit.explanation ?? '').replace(/\r\n/g, '\n').trim().split(/\n[ \t]*\n+/)
  )

  const parents = $derived(
    commit.parents.map((parent) => ({
      ...parent,
      commit: commits.find((candidate) => candidate.oid === parent.oid) ?? null
    }))
  )

  function choose(next: Mode): void {
    requested = { oid: commit.oid, mode: next }
  }

  function onTabKey(event: KeyboardEvent): void {
    const order: Mode[] = ['explanation', 'raw']
    const current = order.indexOf(mode)
    let target = -1
    if (event.key === 'ArrowRight') target = (current + 1) % order.length
    else if (event.key === 'ArrowLeft') target = (current - 1 + order.length) % order.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = order.length - 1
    if (target < 0) return
    event.preventDefault()
    const next = order[target]
    if (next === undefined) return
    choose(next)
    const tab = event.currentTarget as HTMLElement
    const buttons = tab.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[target]?.focus()
  }
</script>

<div class="details">
  {#if hasExplanation}
    <div class="tabs" role="tablist" aria-label="Commit description">
      <button
        type="button"
        role="tab"
        id="{uid}-tab-explanation"
        class="tabs__tab"
        class:tabs__tab--active={mode === 'explanation'}
        aria-selected={mode === 'explanation'}
        aria-controls="{uid}-panel"
        tabindex={mode === 'explanation' ? 0 : -1}
        onclick={() => choose('explanation')}
        onkeydown={onTabKey}
      >
        Explanation
      </button>
      <button
        type="button"
        role="tab"
        id="{uid}-tab-raw"
        class="tabs__tab"
        class:tabs__tab--active={mode === 'raw'}
        aria-selected={mode === 'raw'}
        aria-controls="{uid}-panel"
        tabindex={mode === 'raw' ? 0 : -1}
        onclick={() => choose('raw')}
        onkeydown={onTabKey}
      >
        Commit message
      </button>
    </div>
  {/if}

  <!--
    The tab panel is focusable on purpose: a long explanation or raw message
    scrolls, and a keyboard reader needs to be able to reach and scroll it.
  -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="details__panel"
    id="{uid}-panel"
    role={hasExplanation ? 'tabpanel' : undefined}
    aria-labelledby={hasExplanation ? `${uid}-tab-${mode}` : undefined}
    tabindex={hasExplanation ? 0 : undefined}
  >
    {#if mode === 'explanation'}
      <div class="prose">
        {#each paragraphs as paragraph, index (index)}
          <p class="prose__paragraph">{paragraph}</p>
        {/each}
      </div>
    {:else}
      {#if !hasExplanation}
        <p class="details__panel-label">Commit message</p>
      {/if}
      <!--
        The exact bytes Git recorded, shown as selectable text. It is never
        highlighted or dressed up as executable code.
      -->
      <pre class="raw-message">{commit.rawMessage}</pre>
    {/if}
  </div>

  <dl class="meta">
    <div class="meta__entry">
      <dt class="meta__term">Recorded</dt>
      <dd class="meta__value">
        <time datetime={machineDateTime(commit.committer.when)}>
          {formatDateTime(commit.committer.when)}
        </time>
        <span class="meta__person">{personText(commit.committer.name, commit.committer.email)}</span>
      </dd>
    </div>

    {#if authorDiffersFromCommitter(commit)}
      <div class="meta__entry">
        <dt class="meta__term">Originally written</dt>
        <dd class="meta__value">
          <time datetime={machineDateTime(commit.author.when)}>
            {formatDateTime(commit.author.when)}
          </time>
          <span class="meta__person">{personText(commit.author.name, commit.author.email)}</span>
        </dd>
      </div>
    {/if}

    {#if commit.refs.length > 0}
      <div class="meta__entry">
        <dt class="meta__term">Labels</dt>
        <dd class="meta__value">
          <span class="meta__refs">
            {#each commit.refs as ref (ref.fullName)}
              <RefLabel {ref} />
            {/each}
          </span>
        </dd>
      </div>
    {/if}

    <div class="meta__entry">
      <dt class="meta__term">Commit ID</dt>
      <dd class="meta__value"><span class="oid">{commit.oid}</span></dd>
    </div>

    {#if parents.length > 0}
      <div class="meta__entry">
        <dt class="meta__term">{parents.length > 1 ? 'Builds on' : 'Comes after'}</dt>
        <dd class="meta__value">
          <ul class="parents">
            {#each parents as parent, index (parent.oid + index)}
              <li class="parents__item">
                {#if parent.commit !== null}
                  <button
                    type="button"
                    class="parents__link"
                    onclick={() => onselectparent(parent.oid)}
                  >
                    <span class="parents__text">
                      <span class="parents__summary">{summaryText(parent.commit)}</span>
                      <span class="oid">{parent.oid}</span>
                    </span>
                    <Icon name="arrow" class="parents__arrow" />
                  </button>
                {:else}
                  <!--
                    A parent outside the slice is stated as such instead of
                    being offered as a control that cannot go anywhere.
                  -->
                  <div class="parents__outside">
                    <span class="parents__text">
                      <span class="parents__summary">{boundaryLabel(parent.visibility)}</span>
                      <span class="oid">{parent.oid}</span>
                    </span>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </dd>
      </div>
    {/if}
  </dl>
</div>
