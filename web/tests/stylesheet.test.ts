import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { webRoot } from './helpers'

/**
 * Layout contracts that a rendered page cannot prove.
 *
 * Display cutouts cannot be emulated in a headless browser, so the safe-area
 * rule is enforced where it is actually written: any declaration that protects
 * one horizontal edge must protect the other, because a device held in
 * landscape can put the notch on either side.
 */

const css = readFileSync(join(webRoot, 'src', 'styles', 'app.css'), 'utf8')

/** Declarations, with comments removed so a mention in prose does not count. */
const declarations = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(';')
  .map((line) => line.replace(/\s+/g, ' ').trim())
  .filter((line) => line !== '')

describe('safe-area protection', () => {
  it('is used at all', () => {
    expect(declarations.some((line) => line.includes('env(safe-area-inset-left)'))).toBe(true)
  })

  it('never protects one horizontal edge without the other', () => {
    const lopsided = declarations.filter((line) => {
      const left = line.includes('env(safe-area-inset-left)')
      const right = line.includes('env(safe-area-inset-right)')
      return left !== right
    })
    expect(lopsided).toEqual([])
  })

  it('keeps a minimum gutter alongside the inset instead of trusting it alone', () => {
    const insetDeclarations = declarations.filter((line) =>
      line.includes('env(safe-area-inset-left)')
    )
    for (const line of insetDeclarations) {
      // max(<length>, env(...)) guarantees padding on a device with no cutout.
      expect(line, `${line} must fall back to a fixed gutter`).toMatch(/max\(\s*[\d.]+rem/)
    }
  })

  it('protects the sheet header, where the close control sits on the right edge', () => {
    const rule = css.slice(css.indexOf('.sheet__head {'), css.indexOf('.sheet__title'))
    expect(rule).toContain('env(safe-area-inset-right)')
    expect(rule).toContain('env(safe-area-inset-left)')
  })
})

describe('offline stylesheet', () => {
  it('references no external or embedded resource', () => {
    expect(css).not.toMatch(/url\(/)
    expect(css).not.toMatch(/@import/)
    expect(css).not.toMatch(/@font-face/)
  })
})
