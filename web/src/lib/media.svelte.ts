/**
 * Reactive media queries. The layout breakpoint is expressed in `rem` so a
 * reader who increases their browser text size gets the single-column layout
 * before the split layout becomes cramped.
 */

export const SPLIT_LAYOUT_QUERY = '(min-width: 62rem)'
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export class MediaQuery {
  #matches: boolean = $state(false)
  #query: string

  constructor(query: string, fallback = false) {
    this.#query = query
    this.#matches = typeof window === 'undefined' || !window.matchMedia ? fallback : window.matchMedia(query).matches
  }

  get matches(): boolean {
    return this.#matches
  }

  listen(): () => void {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const list = window.matchMedia(this.#query)
    this.#matches = list.matches
    const handler = (event: MediaQueryListEvent) => {
      this.#matches = event.matches
    }
    list.addEventListener('change', handler)
    return () => list.removeEventListener('change', handler)
  }
}
