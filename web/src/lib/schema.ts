/**
 * TypeScript mirror of the Go-owned report wire contract (schema version 1).
 *
 * Go is canonical. This module only describes and structurally validates what
 * the browser receives; it never derives Git semantics, selects commits, or
 * assigns lanes. When a field is present in the Go schema it is mirrored here
 * with the same name and the same optionality.
 */

export const SUPPORTED_SCHEMA_VERSION = 1

export type HeadKind = 'branch' | 'detached' | 'unborn'
export type Scope = 'all' | 'current'
export type RefKind = 'local-branch' | 'remote-branch' | 'tag' | 'other'
export type ParentVisibility = 'visible' | 'maximum-count-boundary' | 'shallow-boundary'
export type RelationshipKind = 'first-parent' | 'merge' | 'continuation'
export type WarningCode = 'description-outside-slice' | 'incomplete-history'

export interface Generator {
  name: string
  version?: string
}

export interface HeadState {
  kind: HeadKind
  branch?: string
  oid?: string
}

export interface Repository {
  name: string
  head: HeadState
}

export interface Selection {
  scope: Scope
  maximumCount: number
  includedCount: number
  truncated: boolean
}

export interface Person {
  name: string
  email: string
  when: string
}

export interface Parent {
  oid: string
  visibility: ParentVisibility
}

export interface Ref {
  fullName: string
  displayName: string
  kind: RefKind
  isHead: boolean
}

export interface Commit {
  oid: string
  abbreviatedOid: string
  parents: Parent[]
  author: Person
  committer: Person
  subject: string
  rawMessage: string
  explanation?: string
  refs: Ref[]
}

export interface Warning {
  code: WarningCode
  message: string
}

export interface LaneState {
  lane: number
  expectedOid?: string
}

export interface Transition {
  fromLane: number
  toLane: number
  kind: RelationshipKind
  parentOid?: string
  parentIndex?: number
  boundary?: ParentVisibility
}

export interface GraphRow {
  commitOid: string
  nodeLane: number
  incoming: LaneState[]
  outgoing: LaneState[]
  transitions: Transition[]
}

export interface ReportGraph {
  laneCount: number
  rows: GraphRow[]
}

export interface Report {
  schemaVersion: number
  generator: Generator
  generatedAt: string
  repository: Repository
  selection: Selection
  commits: Commit[]
  graph: ReportGraph
  warnings: Warning[]
}

export type StartupFailureReason =
  | 'missing-data'
  | 'invalid-json'
  | 'unsupported-schema'
  | 'invalid-report'

/**
 * ReportStartupError carries a machine-readable reason so the failure state can
 * explain the specific problem instead of showing a blank report.
 */
export class ReportStartupError extends Error {
  readonly reason: StartupFailureReason
  readonly detail: string

  constructor(reason: StartupFailureReason, detail: string) {
    super(`${reason}: ${detail}`)
    this.name = 'ReportStartupError'
    this.reason = reason
    this.detail = detail
  }
}

function fail(detail: string): never {
  throw new ReportStartupError('invalid-report', detail)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${path} must be an object`)
  return value
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} must be an array`)
  return value
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(`${path} must be a string`)
  return value
}

function requireNonEmptyString(value: unknown, path: string): string {
  const text = requireString(value, path)
  if (text === '') fail(`${path} must not be empty`)
  return text
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined
  return requireString(value, path)
}

function requireInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(`${path} must be an integer`)
  return value
}

function optionalInteger(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) return undefined
  return requireInteger(value, path)
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path} must be a boolean`)
  return value
}

function requireEnum<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  const text = requireString(value, path)
  if (!(allowed as readonly string[]).includes(text)) {
    fail(`${path} has unsupported value ${JSON.stringify(text)}`)
  }
  return text as T
}

function optionalEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[]
): T | undefined {
  if (value === undefined || value === null) return undefined
  return requireEnum(value, path, allowed)
}

const HEAD_KINDS: readonly HeadKind[] = ['branch', 'detached', 'unborn']
const SCOPES: readonly Scope[] = ['all', 'current']
const REF_KINDS: readonly RefKind[] = ['local-branch', 'remote-branch', 'tag', 'other']
const PARENT_VISIBILITIES: readonly ParentVisibility[] = [
  'visible',
  'maximum-count-boundary',
  'shallow-boundary'
]
const RELATIONSHIP_KINDS: readonly RelationshipKind[] = ['first-parent', 'merge', 'continuation']
const WARNING_CODES: readonly WarningCode[] = ['description-outside-slice', 'incomplete-history']

function parsePerson(value: unknown, path: string): Person {
  const record = requireRecord(value, path)
  return {
    name: requireString(record.name, `${path}.name`),
    email: requireString(record.email, `${path}.email`),
    when: requireNonEmptyString(record.when, `${path}.when`)
  }
}

function parseRef(value: unknown, path: string): Ref {
  const record = requireRecord(value, path)
  return {
    fullName: requireNonEmptyString(record.fullName, `${path}.fullName`),
    displayName: requireNonEmptyString(record.displayName, `${path}.displayName`),
    kind: requireEnum(record.kind, `${path}.kind`, REF_KINDS),
    isHead: requireBoolean(record.isHead, `${path}.isHead`)
  }
}

function parseParent(value: unknown, path: string): Parent {
  const record = requireRecord(value, path)
  return {
    oid: requireNonEmptyString(record.oid, `${path}.oid`),
    visibility: requireEnum(record.visibility, `${path}.visibility`, PARENT_VISIBILITIES)
  }
}

function parseCommit(value: unknown, path: string): Commit {
  const record = requireRecord(value, path)
  const explanation = optionalString(record.explanation, `${path}.explanation`)
  const commit: Commit = {
    oid: requireNonEmptyString(record.oid, `${path}.oid`),
    abbreviatedOid: requireNonEmptyString(record.abbreviatedOid, `${path}.abbreviatedOid`),
    parents: requireArray(record.parents, `${path}.parents`).map((parent, index) =>
      parseParent(parent, `${path}.parents[${index}]`)
    ),
    author: parsePerson(record.author, `${path}.author`),
    committer: parsePerson(record.committer, `${path}.committer`),
    subject: requireString(record.subject, `${path}.subject`),
    rawMessage: requireString(record.rawMessage, `${path}.rawMessage`),
    refs: requireArray(record.refs, `${path}.refs`).map((ref, index) =>
      parseRef(ref, `${path}.refs[${index}]`)
    )
  }
  // Go guarantees a blank explanation is absent rather than empty. Treating a
  // blank string as absent here keeps the "no explanation" presentation honest
  // even for a hand-written or future producer.
  if (explanation !== undefined && explanation.trim() !== '') commit.explanation = explanation
  return commit
}

function parseLaneState(value: unknown, path: string): LaneState {
  const record = requireRecord(value, path)
  const state: LaneState = { lane: requireInteger(record.lane, `${path}.lane`) }
  const expected = optionalString(record.expectedOid, `${path}.expectedOid`)
  if (expected !== undefined) state.expectedOid = expected
  return state
}

function parseTransition(value: unknown, path: string): Transition {
  const record = requireRecord(value, path)
  const transition: Transition = {
    fromLane: requireInteger(record.fromLane, `${path}.fromLane`),
    toLane: requireInteger(record.toLane, `${path}.toLane`),
    kind: requireEnum(record.kind, `${path}.kind`, RELATIONSHIP_KINDS)
  }
  const parentOid = optionalString(record.parentOid, `${path}.parentOid`)
  const parentIndex = optionalInteger(record.parentIndex, `${path}.parentIndex`)
  const boundary = optionalEnum(record.boundary, `${path}.boundary`, PARENT_VISIBILITIES)
  if (parentOid !== undefined) transition.parentOid = parentOid
  if (parentIndex !== undefined) transition.parentIndex = parentIndex
  if (boundary !== undefined) transition.boundary = boundary
  return transition
}

function parseGraphRow(value: unknown, path: string): GraphRow {
  const record = requireRecord(value, path)
  return {
    commitOid: requireNonEmptyString(record.commitOid, `${path}.commitOid`),
    nodeLane: requireInteger(record.nodeLane, `${path}.nodeLane`),
    incoming: requireArray(record.incoming, `${path}.incoming`).map((state, index) =>
      parseLaneState(state, `${path}.incoming[${index}]`)
    ),
    outgoing: requireArray(record.outgoing, `${path}.outgoing`).map((state, index) =>
      parseLaneState(state, `${path}.outgoing[${index}]`)
    ),
    transitions: requireArray(record.transitions, `${path}.transitions`).map(
      (transition, index) => parseTransition(transition, `${path}.transitions[${index}]`)
    )
  }
}

/**
 * parseReport validates the embedded document structurally and rejects an
 * unsupported schema version before any component runs. It deliberately does
 * not re-derive lane placement: the layout is Go-owned canonical data, and
 * duplicating that algorithm in the browser would create a second source of
 * topology truth.
 */
export function parseReport(value: unknown): Report {
  const record = requireRecord(value, 'report')
  const schemaVersion = requireInteger(record.schemaVersion, 'report.schemaVersion')
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new ReportStartupError(
      'unsupported-schema',
      `this viewer understands report format ${SUPPORTED_SCHEMA_VERSION}, but the file declares format ${schemaVersion}`
    )
  }

  const generator = requireRecord(record.generator, 'report.generator')
  const repository = requireRecord(record.repository, 'report.repository')
  const head = requireRecord(repository.head, 'report.repository.head')
  const selection = requireRecord(record.selection, 'report.selection')
  const graph = requireRecord(record.graph, 'report.graph')

  const headState: HeadState = { kind: requireEnum(head.kind, 'report.repository.head.kind', HEAD_KINDS) }
  const branch = optionalString(head.branch, 'report.repository.head.branch')
  const headOid = optionalString(head.oid, 'report.repository.head.oid')
  if (branch !== undefined) headState.branch = branch
  if (headOid !== undefined) headState.oid = headOid

  const generatorValue: Generator = { name: requireString(generator.name, 'report.generator.name') }
  const generatorVersion = optionalString(generator.version, 'report.generator.version')
  if (generatorVersion !== undefined) generatorValue.version = generatorVersion

  const report: Report = {
    schemaVersion,
    generator: generatorValue,
    generatedAt: requireNonEmptyString(record.generatedAt, 'report.generatedAt'),
    repository: {
      name: requireNonEmptyString(repository.name, 'report.repository.name'),
      head: headState
    },
    selection: {
      scope: requireEnum(selection.scope, 'report.selection.scope', SCOPES),
      maximumCount: requireInteger(selection.maximumCount, 'report.selection.maximumCount'),
      includedCount: requireInteger(selection.includedCount, 'report.selection.includedCount'),
      truncated: requireBoolean(selection.truncated, 'report.selection.truncated')
    },
    commits: requireArray(record.commits, 'report.commits').map((commit, index) =>
      parseCommit(commit, `report.commits[${index}]`)
    ),
    graph: {
      laneCount: requireInteger(graph.laneCount, 'report.graph.laneCount'),
      rows: requireArray(graph.rows, 'report.graph.rows').map((row, index) =>
        parseGraphRow(row, `report.graph.rows[${index}]`)
      )
    },
    // Go always emits this array, so an absent field means the document is not
    // the contract it claims to be. Defaulting it here would hide exactly the
    // limitations the reader most needs.
    warnings: requireArray(record.warnings, 'report.warnings').map((warning, index) => {
      const item = requireRecord(warning, `report.warnings[${index}]`)
      return {
        code: requireEnum(item.code, `report.warnings[${index}].code`, WARNING_CODES),
        message: requireNonEmptyString(item.message, `report.warnings[${index}].message`)
      }
    })
  }

  if (report.graph.rows.length !== report.commits.length) {
    fail(
      `graph has ${report.graph.rows.length} rows for ${report.commits.length} commits`
    )
  }
  report.commits.forEach((commit, index) => {
    const row = report.graph.rows[index]
    if (row === undefined || row.commitOid !== commit.oid) {
      fail(`graph row ${index} does not describe commit ${index}`)
    }
  })
  if (report.selection.includedCount !== report.commits.length) {
    fail(
      `selection reports ${report.selection.includedCount} commits but ${report.commits.length} are present`
    )
  }

  return report
}

/** Parses the inert JSON payload emitted by Go assembly. */
export function parseReportJson(text: string): Report {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch (error) {
    throw new ReportStartupError(
      'invalid-json',
      error instanceof Error ? error.message : 'the embedded report data is not valid JSON'
    )
  }
  return parseReport(value)
}
