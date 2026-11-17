/**
 * Decide what an install input names before any install runs.
 *
 * The same URL can be a plugin bundle, a Skill directory or an MCP server, and
 * the address alone often cannot tell. This module keeps the decision in one
 * place with a fixed precedence: an explicit prefix the person typed, then the
 * source's own contents when it can be read through the GitHub API, then the
 * URL shape as a last resort. Every answer carries why it was chosen so the
 * dialog can show the target and let the person override it.
 *
 * It never installs, writes files, or mutates the inventory. A source that
 * cannot be read falls back to the shape guess, so an add that used to work
 * keeps working when the API is unavailable.
 * @module @liusiqi-dev/sqh-plugin-manager/source-detector
 */

import { parseGithubRepository } from './github-api.ts'
import type { ExtensionKind } from './extension-registry.ts'

/** Explicit prefix choice, from the dialog or the typed spec. */
export type SourceHint = 'auto' | ExtensionKind

/** How confident the answer is, for the dialog's disclosure. */
export type DetectionConfidence = 'explicit' | 'content' | 'shape'

/** What the install input was determined to be. */
export interface DetectedSource {
  readonly kind: ExtensionKind
  /** The spec after removing an explicit kind prefix, ready for the executor. */
  readonly spec: string
  readonly confidence: DetectionConfidence
  /** Short reasons shown beside the target location. */
  readonly evidence: readonly string[]
  /** The destination shown before the install starts. */
  readonly location: string
}

/** Where each kind is loaded from, shown in the dialog before installing. */
export const EXTENSION_LOCATIONS: Readonly<Record<ExtensionKind, string>> = {
  plugin: '~/.sqode/profiles/desktop/package.json',
  skill: '~/.sqode/skills/<name>/SKILL.md',
  mcp: '~/.sqode/profiles/desktop/cordis.patch.yml',
}

/** Explicit `kind:` prefixes, checked before any inference. */
const PREFIXES: Readonly<Record<string, ExtensionKind>> = { plugin: 'plugin', skill: 'skill', mcp: 'mcp' }
const SKILL_FILE = /(?:^|\/)SKILL\.md(?:$|\?|#)/i
const SKILL_DIR = /(?:^|\/)skills?(?:\/|$)/i
const MCP_DIR = /(?:^|\/)mcp(?:\/|$)/i

/** Read an explicit prefix without treating a URL scheme as a kind. */
export function splitExplicitPrefix(raw: string): { kind?: ExtensionKind; spec: string } {
  const match = /^([a-z]+):(.+)$/i.exec(raw.trim())
  const kind = match === null ? undefined : PREFIXES[match[1]?.toLowerCase() ?? '']
  return kind === undefined || match === null ? { spec: raw.trim() } : { kind, spec: match[2] as string }
}

/** URL-shape guess: a local path or package name stays a plugin as before. */
export function detectFromShape(spec: string): ExtensionKind {
  if (SKILL_FILE.test(spec) || SKILL_DIR.test(spec)) return 'skill'
  if (MCP_DIR.test(spec)) return 'mcp'
  return 'plugin'
}

/** A tiny repository snapshot read for classification: paths and small file bodies. */
export interface SourceSnapshot {
  readonly paths: readonly string[]
  readonly files: Readonly<Record<string, string | undefined>>
}

/**
 * Classify from repository contents. Content evidence outranks the URL shape;
 * a Skill is only a Skill when it has a SKILL.md with the loader's frontmatter.
 * @returns undefined when nothing decisive was found.
 */
export function detectFromContents(snapshot: SourceSnapshot): { kind: ExtensionKind; evidence: readonly string[] } | undefined {
  const skillFile = snapshot.paths.find(path => /(?:^|\/)SKILL\.md$/i.test(path))
  if (skillFile !== undefined) {
    const text = snapshot.files[skillFile]
    if (text !== undefined && /^---[\s\S]*?^name\s*:/m.test(text) && /^description\s*:/m.test(text)) {
      return { kind: 'skill', evidence: [`SKILL.md frontmatter (${skillFile})`] }
    }
  }
  const mcpConfig = snapshot.paths.find(path => /(?:^|\/)(?:\.mcp\.json|mcp\.json|mcp-servers\.json)$/i.test(path))
  if (mcpConfig !== undefined) return { kind: 'mcp', evidence: [`MCP configuration (${mcpConfig})`] }
  const patch = snapshot.paths.find(path => /(?:^|\/)cordis\.patch\.ya?ml$/i.test(path))
  if (patch !== undefined && /\b(?:sqh|dsh)-mcp-client\b/.test(snapshot.files[patch] ?? '')) {
    return { kind: 'mcp', evidence: [`Cordis patch mounts mcp-client (${patch})`] }
  }
  const manifest = snapshot.paths.find(path => path === 'package.json')
  if (manifest !== undefined && /"(?:dsh|sqh)"\s*:\s*\{[\s\S]*?"bundle"\s*:/.test(snapshot.files[manifest] ?? '')) {
    return { kind: 'plugin', evidence: ['package.json declares dsh/sqh.bundle'] }
  }
  return undefined
}

/**
 * Full classification with an explicit hint and a shape fallback.
 * @param raw - the typed input.
 * @param hint - a dialog choice; `auto` lets prefix/content/shape decide.
 * @param snapshot - repository contents when already available; absent means shape only.
 */
export function detectSource(
  raw: string, hint: SourceHint = 'auto', snapshot?: SourceSnapshot,
): DetectedSource {
  const explicit = splitExplicitPrefix(raw)
  if (explicit.kind !== undefined) return {
    kind: explicit.kind, spec: explicit.spec, confidence: 'explicit',
    evidence: ['Explicit prefix'], location: EXTENSION_LOCATIONS[explicit.kind],
  }
  if (hint !== 'auto') return {
    kind: hint, spec: raw.trim(), confidence: 'explicit',
    evidence: ['Selected in dialog'], location: EXTENSION_LOCATIONS[hint],
  }
  const content = snapshot === undefined ? undefined : detectFromContents(snapshot)
  const kind = content?.kind ?? detectFromShape(raw.trim())
  return {
    kind, spec: raw.trim(),
    confidence: content === undefined ? 'shape' : 'content',
    evidence: content?.evidence ?? ['URL shape'],
    location: EXTENSION_LOCATIONS[kind],
  }
}

/** GitHub repository parts when the spec names one, for the API content reader. */
export function githubParts(raw: string) {
  return parseGithubRepository(splitExplicitPrefix(raw).spec)
}
