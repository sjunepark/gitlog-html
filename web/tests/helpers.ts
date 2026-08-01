import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseReport, type Report } from '../src/lib/schema'

const here = dirname(fileURLToPath(import.meta.url))
export const webRoot = resolve(here, '..')
export const repoRoot = resolve(webRoot, '..')

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

export function fixture(name: string): Report {
  return parseReport(readJson(join(webRoot, 'fixtures', `${name}.json`)))
}

/** The Go-owned golden fixture, used to prove the TypeScript mirror agrees. */
export function goldenFixture(): unknown {
  return readJson(join(repoRoot, 'testdata', 'report-v1.json'))
}
