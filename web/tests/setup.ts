import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/svelte'
import { afterEach, beforeEach, vi } from 'vitest'

/**
 * jsdom does not implement the three browser APIs the report relies on. Each
 * stub below is deliberately small and controllable so component tests can
 * assert real behaviour instead of asserting around a missing API.
 */

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= TestResizeObserver

/** Media queries the current test wants to report as matching. */
export const matchingMedia = new Set<string>()

const mediaListeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>()

/**
 * Crosses a breakpoint the way a resize does: flip the match, then notify the
 * live listeners. Without this a test can only observe the layout it started
 * in, which is exactly where the dialog-teardown defect lived.
 */
export function setMediaMatch(query: string, matches: boolean): void {
  if (matches) matchingMedia.add(query)
  else matchingMedia.delete(query)
  for (const listener of [...(mediaListeners.get(query) ?? [])]) {
    listener({ matches, media: query } as MediaQueryListEvent)
  }
}

if (typeof window !== 'undefined') {
  window.matchMedia = ((query: string) => {
    return {
      media: query,
      get matches() {
        return matchingMedia.has(query)
      },
      onchange: null,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        const listeners = mediaListeners.get(query) ?? new Set()
        listeners.add(listener)
        mediaListeners.set(query, listeners)
      },
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaListeners.get(query)?.delete(listener)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    } as MediaQueryList
  }) as typeof window.matchMedia

  // jsdom ships the <dialog> element without its modal behaviour. close() fires
  // `close` only — never `cancel` — which is exactly how real browsers
  // distinguish teardown from a reader dismissing the dialog.
  if (typeof HTMLDialogElement !== 'undefined') {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true
    }
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      if (!this.open) return
      this.open = false
      this.dispatchEvent(new Event('close'))
    }
  }
}

beforeEach(() => {
  matchingMedia.clear()
  mediaListeners.clear()
  window.location.hash = ''
  vi.restoreAllMocks()
})

// Vitest runs without globals, so Testing Library's automatic teardown is not
// registered for us.
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})
