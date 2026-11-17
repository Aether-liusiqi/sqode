/**
 * Decide what an install input names and where it belongs.
 *
 * Sqode keeps three different extension kinds in three different places: a
 * plugin bundle is a profile dependency, a Skill is a directory with SKILL.md,
 * and an MCP server is one `sqh-mcp-client` row in a Cordis patch. Sending all
 * three through `pnpm add` silently installs a Skill or MCP package into the
 * plugin profile, where nothing will load it. This module classifies before
 * any install runs and is deliberately free of I/O so it can be tested on its
 * own and reused by both the Host and the dialog's early feedback.
 *
 * An explicit prefix always wins. Otherwise a URL that names a Skill file or
 * a skills directory is a Skill; everything else stays a plugin, which keeps
 * every previously accepted spec behaving exactly as before.
 * @module @liusiqi-dev/sqh-plugin-manager/install-target
 */

import { isAbsolute } from 'node:path'

/** The extension kinds the manager can place. */
export type InstallTargetKind = 'plugin' | 'skill' | 'mcp'

/** Where a classified install belongs. Paths are relative to SQODE_HOME unless absolute. */
export interface InstallTarget {
  readonly kind: InstallTargetKind
  /** The original spec with any explicit prefix removed, ready for that kind's executor. */
  readonly spec: string
  /** Human-readable destination, used in the dialog before the install runs. */
  readonly location: string
  /** How the kind was decided: an explicit choice, source contents, or URL shape. */
  readonly confidence?: 'explicit' | 'content' | 'shape'
  /** Why that kind was chosen, for the dialog's early feedback. */
  readonly evidence?: readonly string[]
}

/** A hint the person can pick explicitly in the install dialog. */
export type InstallTargetHint = 'auto' | InstallTargetKind

/** Explicit prefixes, checked before any URL shape so a manual choice cannot be overridden. */
const PREFIXES: Readonly<Record<string, InstallTargetKind>> = {
  plugin: 'plugin', skill: 'skill', mcp: 'mcp',
}

/** A URL that points at a Skill definition rather than a package repository. */
const SKILL_FILE = /(?:^|\/)SKILL\.md(?:$|\?|#)/i
const SKILL_DIR = /(?:^|\/)skills?(?:\/|$)/i
const MCP_SERVER = /(?:^|\/)mcp(?:\/|$)/i

/** Destinations shown in the dialog; the Skill root matches `skill-filesystem`'s user root. */
export const INSTALL_LOCATIONS: Readonly<Record<InstallTargetKind, string>> = {
  plugin: '~/.sqode/profiles/desktop/package.json',
  skill: '~/.sqode/skills/<name>/SKILL.md',
  mcp: '~/.sqode/profiles/desktop/cordis.patch.yml',
}

/**
 * Classify one install input without performing I/O.
 * @param raw - what the person typed.
 * @param hint - an explicit dialog choice, or `auto` for URL-shape inference.
 */
export function classifyInstallTarget(raw: string, hint: InstallTargetHint = 'auto'): InstallTarget {
  const trimmed = raw.trim()
  const prefixMatch = /^([a-z]+):(?:\/\/)?(.+)$/i.exec(trimmed)
  const prefixKind = prefixMatch === null ? undefined : PREFIXES[prefixMatch[1]?.toLowerCase() ?? '']
  if (prefixMatch !== null && prefixKind !== undefined) {
    const spec = prefixMatch[2] as string
    return { kind: prefixKind, spec, location: INSTALL_LOCATIONS[prefixKind] }
  }
  if (hint !== 'auto') return { kind: hint, spec: trimmed, location: INSTALL_LOCATIONS[hint] }

  const kind = inferFromSpec(trimmed)
  return { kind, spec: trimmed, location: INSTALL_LOCATIONS[kind] }
}

/** Infer a kind from URL shape; a local path or package name is a plugin. */
function inferFromSpec(spec: string): InstallTargetKind {
  if (SKILL_FILE.test(spec) || SKILL_DIR.test(spec)) return 'skill'
  if (MCP_SERVER.test(spec)) return 'mcp'
  // `skill:` and `mcp:` shorthands are consumed above; a remaining absolute
  // path is the plugin manager's local-directory form.
  if (isAbsolute(spec)) return 'plugin'
  return 'plugin'
}

/** Whether a spec carries an explicit kind prefix, for dialogs that echo the choice back. */
export function hasExplicitTargetHint(raw: string): boolean {
  const match = /^([a-z]+):/i.exec(raw.trim())
  return match !== null && PREFIXES[match[1]?.toLowerCase() ?? ''] !== undefined
}
