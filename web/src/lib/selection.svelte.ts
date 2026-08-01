/**
 * Selection state mirrored into the URL fragment.
 *
 * The fragment holds a full object ID so a copied file reopens on the same
 * commit. Only `location.hash` assignment is used: `history.pushState` is
 * rejected for opaque-origin documents in some browsers, and a report is
 * normally opened straight from a file URL.
 */

export class CommitSelection {
  #knownOids: Set<string> = new Set()
  #oid: string | null = $state(null)

  constructor(oids: readonly string[]) {
    this.#knownOids = new Set(oids)
    this.#oid = this.#fromFragment()
  }

  get oid(): string | null {
    return this.#oid
  }

  /** True while the reader is looking at a specific commit. */
  get hasSelection(): boolean {
    return this.#oid !== null
  }

  #fromFragment(): string | null {
    const raw = readFragment()
    return raw !== null && this.#knownOids.has(raw) ? raw : null
  }

  /** Selecting writes a history entry so browser back and forward work. */
  select(oid: string): void {
    if (!this.#knownOids.has(oid)) return
    this.#oid = oid
    writeFragment(oid)
  }

  /**
   * Clearing replaces the current entry. Closing details therefore returns the
   * reader to the history position they came from instead of stacking an empty
   * state on top of it.
   */
  clear(): void {
    if (this.#oid === null) return
    this.#oid = null
    replaceFragment('')
  }

  /** Re-reads the fragment after a browser navigation. */
  syncFromLocation(): void {
    this.#oid = this.#fromFragment()
  }

  /** Attaches navigation listening; returns the matching detach function. */
  listen(): () => void {
    const handler = () => this.syncFromLocation()
    window.addEventListener('hashchange', handler)
    window.addEventListener('popstate', handler)
    return () => {
      window.removeEventListener('hashchange', handler)
      window.removeEventListener('popstate', handler)
    }
  }
}

export function readFragment(): string | null {
  const raw = window.location.hash.replace(/^#/, '')
  if (raw === '') return null
  try {
    return decodeURIComponent(raw)
  } catch {
    // A malformed escape sequence is simply not a commit we know about.
    return raw
  }
}

function writeFragment(oid: string): void {
  if (readFragment() === oid) return
  window.location.hash = oid
}

function replaceFragment(value: string): void {
  const target = `${window.location.pathname}${window.location.search}${value === '' ? '' : `#${value}`}`
  try {
    window.history.replaceState(null, '', target)
  } catch {
    // Opaque-origin documents can refuse replaceState; the fragment assignment
    // below always works and only costs one extra history entry.
    window.location.hash = value
  }
}
