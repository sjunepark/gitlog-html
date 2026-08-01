import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { webRoot } from './helpers'

/**
 * Contrast is a product requirement in both colour schemes, so it is measured
 * from the stylesheet rather than eyeballed in a screenshot.
 */

const css = readFileSync(join(webRoot, 'src', 'styles', 'app.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const index = css.indexOf(selector)
  // Without this, a renamed selector would silently return the first block in
  // the file and the dark scheme would be measured against light tokens.
  if (index < 0) throw new Error(`stylesheet has no ${selector} block`)
  const open = css.indexOf('{', index)
  const close = css.indexOf('}', open)
  const tokens: Record<string, string> = {}
  for (const line of css.slice(open + 1, close).split('\n')) {
    const match = /^\s*(--[\w-]+):\s*(#[0-9a-f]{6});/i.exec(line)
    if (match?.[1] !== undefined && match[2] !== undefined) tokens[match[1]] = match[2]
  }
  return tokens
}

const light = block(':root {')
const dark = block('@media (prefers-color-scheme: dark)')

function channel(value: number): number {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const r = channel(Number.parseInt(hex.slice(1, 3), 16))
  const g = channel(Number.parseInt(hex.slice(3, 5), 16))
  const b = channel(Number.parseInt(hex.slice(5, 7), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a: string, b: string): number {
  const first = luminance(a)
  const second = luminance(b)
  const [high, low] = first > second ? [first, second] : [second, first]
  return (high + 0.05) / (low + 0.05)
}

const schemes: [string, Record<string, string>][] = [
  ['light', light],
  ['dark', dark]
]

describe('colour scheme contrast', () => {
  it.each(schemes)('%s: every token is defined', (_name, tokens) => {
    const lanes = Array.from({ length: 6 }, (_, lane) => `--lane-${lane}`)
    for (const token of [
      '--paper',
      '--surface',
      '--selected',
      '--sunken',
      '--ink',
      '--muted',
      '--faint',
      '--chip-border',
      '--focus',
      ...lanes
    ]) {
      expect(tokens[token], `${token} is missing`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it.each(schemes)('%s: body and secondary text clear 4.5:1', (_name, tokens) => {
    // Includes the selected-row tint and the hover tint: secondary text keeps
    // its contrast on every surface it can actually land on.
    const surfaces = ['--paper', '--surface', '--selected', '--sunken']
    for (const surface of surfaces.map((token) => tokens[token]!)) {
      expect(ratio(tokens['--ink']!, surface)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(tokens['--muted']!, surface)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(tokens['--faint']!, surface)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(schemes)('%s: lane strokes and control borders clear 3:1', (_name, tokens) => {
    for (let lane = 0; lane < 6; lane += 1) {
      expect(ratio(tokens[`--lane-${lane}`]!, tokens['--paper']!)).toBeGreaterThanOrEqual(3)
    }
    expect(ratio(tokens['--chip-border']!, tokens['--paper']!)).toBeGreaterThanOrEqual(3)
    expect(ratio(tokens['--chip-border']!, tokens['--surface']!)).toBeGreaterThanOrEqual(3)
  })

  it.each(schemes)('%s: the focus ring stays visible on every surface', (_name, tokens) => {
    expect(ratio(tokens['--focus']!, tokens['--paper']!)).toBeGreaterThanOrEqual(3)
    expect(ratio(tokens['--focus']!, tokens['--selected']!)).toBeGreaterThanOrEqual(3)
  })
})
