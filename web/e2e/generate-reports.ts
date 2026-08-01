/**
 * Prepares real reports for the browser suite.
 *
 * The rest of the suite opens harness documents this repository assembles in
 * JavaScript. Those prove the browser contract, but not that the Go assembler
 * produces a document a browser will actually accept. This module closes that
 * gap: it builds the real CLI once, drives the real `git` executable to create
 * throwaway repositories, and runs the CLI over them. The specs then open the
 * resulting files through `file://`, exactly as a reader would.
 *
 * It runs as Playwright's global setup, so it executes once before any worker
 * starts. Nothing here is per-test, and no test writes to these paths, which is
 * what keeps the suite safe under parallel workers.
 *
 * Go and Git are required dependencies of this project, not optional extras, so
 * a missing one fails loudly with context rather than skipping. The single
 * capability-dependent case is the shallow clone, which docs/verification.md
 * allows to be skipped with an explicit reason.
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const webRoot = resolve(here, '..')
const repoRoot = resolve(webRoot, '..')

const outputRoot = join(webRoot, 'test-output', 'generated')
export const manifestPath = join(outputRoot, 'manifest.json')

/** Empty file that stands in for the developer's global Git configuration. */
const isolatedConfig = join(outputRoot, 'git-config-empty')

export interface GeneratedReport {
  /** Absolute path to the standalone HTML file. */
  html: string
  /** Repository display name the report should show as its heading. */
  repository: string
  /** Commits the CLI reported including. */
  commits: number
}

export interface GeneratedManifest {
  /** Reason the shallow case specifically is unavailable, or null. */
  shallowSkip: string | null
  reports: Record<string, GeneratedReport>
}

/** Subject that exists only on an unmerged ref, never on the current branch. */
export const REF_ONLY_SUBJECT = 'Sketch an idea that never landed on main'

/**
 * Git, isolated from whoever is running the tests.
 *
 * Identity, dates and branch naming are all explicit, and configuration is
 * pinned to an empty file with the system file switched off. A report generated
 * here must not depend on the developer's configuration, or the assertions
 * would pass or fail for reasons that have nothing to do with the product.
 * Pointing at a real empty file rather than a device node keeps this portable.
 */
function isolatedEnvironment(when?: string): NodeJS.ProcessEnv {
  const stamp = when ?? '2026-03-02T09:00:00+00:00'
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: isolatedConfig,
    GIT_CONFIG_SYSTEM: isolatedConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_DATE: stamp,
    GIT_COMMITTER_DATE: stamp,
    GIT_AUTHOR_NAME: 'Ada Reporter',
    GIT_AUTHOR_EMAIL: 'ada@example.test',
    GIT_COMMITTER_NAME: 'Ada Reporter',
    GIT_COMMITTER_EMAIL: 'ada@example.test'
  }
}

const IDENTITY = ['-c', 'user.name=Ada Reporter', '-c', 'user.email=ada@example.test']

function git(cwd: string, args: string[], when?: string): void {
  execFileSync('git', [...IDENTITY, ...args], {
    cwd,
    stdio: 'pipe',
    env: isolatedEnvironment(when)
  })
}

/** Read-only Git, under the same isolation as every writing call. */
function gitOutput(cwd: string, args: string[]): string {
  return execFileSync('git', [...IDENTITY, ...args], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    env: isolatedEnvironment()
  }).trim()
}

function initRepository(path: string): void {
  mkdirSync(path, { recursive: true })
  git(path, ['init', '--quiet', '--initial-branch=main', '.'])
}

function commit(path: string, file: string, body: string, message: string, when: string): void {
  writeFileSync(join(path, file), `${body}\n`)
  git(path, ['add', '--all'], when)
  git(path, ['commit', '--quiet', '--message', message], when)
}

function day(index: number): string {
  // Fixed, ordered timestamps: the report's dates and its selection order are
  // then deterministic.
  return `2026-03-${String(index).padStart(2, '0')}T09:00:00+00:00`
}

/*
 * Hostile payloads for the one report the real CLI generates from hostile
 * input. Written with escapes so this source file stays ASCII and cannot be
 * reordered by its own test data.
 *
 * Angle-bracket markup lives in messages, explanations and ref names, all of
 * which Git round-trips byte for byte. It deliberately stays out of the
 * identities: `--author` takes a `Name <email>` mini-format, so markup there
 * would be parsed as the address and the value the test asserts would not be
 * the value Git stored. The identities carry the other hostile classes
 * instead — quotes, ampersands, backslashes and handler-like text — and Git
 * records them exactly.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028)
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029)
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(0x202e)
const POP_DIRECTIONAL_FORMATTING = String.fromCharCode(0x202c)

/** "A<RLO>BC<PDF> Z" — B must still paint to the left of C. */
export const BIDI_ORDER_PROBE =
  `Order check: A${RIGHT_TO_LEFT_OVERRIDE}BC${POP_DIRECTIONAL_FORMATTING} Z`

export const HOSTILE_SUBJECT = `Merge </script><script>alert('subject')</script> & "quoted" work`

export const HOSTILE_BODY = [
  `Closing style: </style><style>body{display:none}</style>`,
  `Image and handler: <img src=x onerror=alert(1)>`,
  `Backslashes: C:\\Users\\admin and \\\\ and \\u0041 is not an escape`,
  `Separators:${LINE_SEPARATOR}after a line separator${PARAGRAPH_SEPARATOR}after a paragraph separator`,
  BIDI_ORDER_PROBE
].join('\n')

export const HOSTILE_EXPLANATION = [
  `Agent note: </script><script>alert('explanation')</script> and </style><style>*{}</style>.`,
  '',
  `Quotes "double" 'single', ampersand &, backslashes C:\\tmp\\x and \\\\.`,
  `Separator follows:${LINE_SEPARATOR}and a paragraph separator:${PARAGRAPH_SEPARATOR}done.`,
  BIDI_ORDER_PROBE
].join('\n')

/**
 * Valid Git identities that still read as hostile.
 *
 * Neither name ends in one of the characters Git strips from an identity —
 * `. , : ; < > " ' \` — so what the test asserts is exactly what Git stores.
 */
export const HOSTILE_AUTHOR_NAME = `Robin " & \\ onerror=alert(1)`
export const HOSTILE_AUTHOR_EMAIL = 'robin@example.test'
export const HOSTILE_COMMITTER_NAME = `Automation "bot" & Co. \\ pipeline`
export const HOSTILE_COMMITTER_EMAIL = 'bot@example.test'

/** Valid ref names that still read as hostile. Backslashes are illegal here. */
export const HOSTILE_BRANCH = `feature/<script>alert(1)</script>`
export const HOSTILE_TAG = `v0.0.0-"quoted"&more`

/** Runs the built CLI. Returns the commit count it reported including. */
function generate(binary: string, args: string[]): number {
  const stdout = execFileSync(binary, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    env: isolatedEnvironment()
  })
  const match = /with (\d+) commits?/.exec(stdout)
  if (match?.[1] === undefined) {
    throw new Error(`could not read the commit count from CLI output: ${stdout}`)
  }
  return Number(match[1])
}

/**
 * Thirteen commits: a merged feature branch, a tag, and one commit that lives
 * only on an unmerged ref. The last one is the point — without it, `--scope
 * all` and `--scope current` would select the same history and the all-refs
 * behaviour would go unproven.
 */
function buildOrdinary(root: string): string {
  const path = join(root, 'ordinary')
  initRepository(path)
  for (let index = 1; index <= 6; index += 1) {
    commit(path, 'notes.txt', `line ${index}`, `Record step ${index}`, day(index))
  }
  git(path, ['tag', 'v1.0.0'], day(6))

  git(path, ['checkout', '--quiet', '-b', 'feature/quotes', 'HEAD~2'], day(7))
  commit(path, 'quotes.txt', 'draft', 'Draft the quote builder', day(7))
  commit(path, 'quotes.txt', 'draft two', 'Save quotes as drafts', day(8))
  git(path, ['checkout', '--quiet', 'main'], day(9))
  git(path, ['merge', '--quiet', '--no-ff', '-m', 'Merge the quote builder', 'feature/quotes'], day(9))

  // Reachable from its own ref and from nothing else.
  git(path, ['checkout', '--quiet', '-b', 'experiment/abandoned'], day(10))
  commit(path, 'idea.txt', 'sketch', REF_ONLY_SUBJECT, day(10))
  git(path, ['checkout', '--quiet', 'main'], day(11))

  for (let index = 11; index <= 13; index += 1) {
    commit(path, 'notes.txt', `later ${index}`, `Follow up ${index}`, day(index))
  }
  return path
}

function buildHostile(root: string): { path: string; descriptions: string } {
  const path = join(root, 'hostile')
  initRepository(path)
  commit(path, 'safe.txt', 'base', 'Start the repository', day(1))
  writeFileSync(join(path, 'payload.txt'), 'inert\n')
  git(path, ['add', '--all'], day(2))

  // The committer identity comes from the environment, which outranks config,
  // so it is overridden here rather than with a `-c` flag.
  execFileSync(
    'git',
    [
      'commit',
      '--quiet',
      '--message',
      HOSTILE_SUBJECT,
      '--message',
      HOSTILE_BODY,
      '--author',
      `${HOSTILE_AUTHOR_NAME} <${HOSTILE_AUTHOR_EMAIL}>`
    ],
    {
      cwd: path,
      stdio: 'pipe',
      env: {
        ...isolatedEnvironment(day(2)),
        GIT_COMMITTER_NAME: HOSTILE_COMMITTER_NAME,
        GIT_COMMITTER_EMAIL: HOSTILE_COMMITTER_EMAIL
      }
    }
  )

  git(path, ['branch', HOSTILE_BRANCH], day(2))
  git(path, ['tag', HOSTILE_TAG], day(2))

  const head = gitOutput(path, ['rev-parse', 'HEAD'])
  const descriptions = join(path, 'descriptions.json')
  writeFileSync(
    descriptions,
    JSON.stringify(
      {
        [head]: HOSTILE_EXPLANATION,
        // A description for a commit outside the slice: the CLI warns and
        // carries on, which is the documented behaviour for a reused file.
        '0000000000000000000000000000000000000000': 'Never attaches to anything.'
      },
      null,
      2
    )
  )
  return { path, descriptions }
}

function buildDetached(root: string): string {
  const path = join(root, 'detached')
  initRepository(path)
  for (let index = 1; index <= 3; index += 1) {
    commit(path, 'file.txt', `v${index}`, `Change ${index}`, day(index))
  }
  git(path, ['-c', 'advice.detachedHead=false', 'checkout', '--quiet', 'HEAD~1'], day(4))
  return path
}

function buildDescriptions(root: string, repository: string): string {
  // Explanations for some commits and none for others, so one report shows
  // both the explanation-led row and the subject fallback.
  const ids = gitOutput(repository, ['log', '--format=%H', '--max-count=4']).split('\n')
  const map: Record<string, string> = {}
  ids.slice(0, 2).forEach((id, index) => {
    map[id] = `Explained by the agent: change ${index + 1} of the visible slice.`
  })
  const path = join(root, 'ordinary-descriptions.json')
  writeFileSync(path, JSON.stringify(map, null, 2))
  return path
}

function require(tool: string, check: () => void, guidance: string): void {
  try {
    check()
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error)
    throw new Error(
      `generated-report setup needs ${tool}, which this environment cannot run. ${guidance}\n  ${detail}`
    )
  }
}

export default function prepareGeneratedReports(): void {
  rmSync(outputRoot, { recursive: true, force: true })
  mkdirSync(outputRoot, { recursive: true })
  writeFileSync(isolatedConfig, '')

  const binary = join(outputRoot, 'bin', 'gitlog-html')
  mkdirSync(dirname(binary), { recursive: true })

  // Git is the generator's runtime dependency and Go builds it. Neither is
  // optional for this cross-layer check, so a missing one fails the run.
  require(
    'Git',
    () => execFileSync('git', ['--version'], { stdio: 'pipe', env: isolatedEnvironment() }),
    'Git is a required runtime dependency of gitlog-html.'
  )
  require(
    'the Go toolchain',
    () =>
      execFileSync('go', ['build', '-o', binary, './cmd/gitlog-html'], {
        cwd: repoRoot,
        stdio: 'pipe'
      }),
    'Go builds the CLI whose output these tests open.'
  )

  const repositories = join(outputRoot, 'repositories')
  const html = join(outputRoot, 'reports')
  mkdirSync(repositories, { recursive: true })
  mkdirSync(html, { recursive: true })

  const ordinary = buildOrdinary(repositories)
  const descriptions = buildDescriptions(repositories, ordinary)
  const hostile = buildHostile(repositories)
  const detached = buildDetached(repositories)
  const empty = join(repositories, 'empty')
  initRepository(empty)

  const manifest: GeneratedManifest = { shallowSkip: null, reports: {} }
  const record = (name: string, repository: string, args: string[]): void => {
    const file = join(html, `${name}.html`)
    const commits = generate(binary, ['--repo', repository, '--output', file, ...args])
    manifest.reports[name] = { html: file, repository: basename(repository), commits }
  }

  // Default: every ref, ten commits, and therefore truncation.
  record('all-default', ordinary, ['--descriptions', descriptions])
  // The current branch, deep enough that the ref-only commit's absence is a
  // statement about scope rather than about the limit.
  record('current-limit', ordinary, ['--scope', 'current', '--max-count', '12'])
  record('empty', empty, [])
  record('detached', detached, ['--scope', 'current'])
  record('hostile', hostile.path, ['--descriptions', hostile.descriptions])

  // A report carried away from the repository it describes. Nothing about it
  // may depend on the repository still being there — or on it ever existing.
  const relocated = join(outputRoot, 'relocated', 'carried-away.html')
  mkdirSync(dirname(relocated), { recursive: true })
  copyFileSync(manifest.reports['all-default']!.html, relocated)
  manifest.reports['relocated'] = { ...manifest.reports['all-default']!, html: relocated }

  // The one capability-dependent case: some environments cannot create a
  // shallow clone, and docs/verification.md allows skipping that with a reason.
  // The catch covers the clone and nothing else — generating the report from a
  // clone that did succeed is ordinary work, and a CLI failure there must fail
  // the run rather than be relabelled as a missing Git capability.
  const shallow = join(repositories, 'shallow')
  let cloned = false
  try {
    execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${ordinary}`, shallow], {
      stdio: 'pipe',
      env: isolatedEnvironment()
    })
    cloned = true
  } catch (error) {
    manifest.shallowSkip = `this Git could not produce a shallow clone: ${
      error instanceof Error ? error.message.split('\n')[0] : String(error)
    }`
  }
  if (cloned) record('shallow', shallow, [])

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}
