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

if (typeof window !== 'undefined') {
  window.matchMedia = ((query: string) => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    return {
      media: query,
      get matches() {
        return matchingMedia.has(query)
      },
      onchange: null,
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false
    } as MediaQueryList
  }) as typeof window.matchMedia

  // jsdom ships the <dialog> element without its modal behaviour.
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
  window.location.hash = ''
  vi.restoreAllMocks()
})

// Vitest runs without globals, so Testing Library's automatic teardown is not
// registered for us.
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})
