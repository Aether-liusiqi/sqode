/**
 * Read what someone typed into the install field before any Host call runs.
 *
 * The dialog used to hand every input to the plugin inspector first, so an
 * explicit `skill:` prefix was refused by npm spec parsing before the extension
 * classifier could look at it, and a GitHub URL depended on a Remote service
 * that may not be mounted. Both are ordering faults, not parsing faults: the
 * kind has to be decided here, from the text alone, before the plugin path can
 * veto it.
 *
 * This module is deliberately free of I/O and Host dependencies so it can be
 * tested on its own and cannot fail because a service is missing.
 * @module @liusiqi-dev/sqh-plugin-manager/classify-install-input
 */

/** The kinds this manager can place. */
export type InstallKind = 'plugin' | 'skill' | 'mcp'

/** What the field names, and why. */
export interface ClassifiedInput {
  readonly kind: InstallKind
  /** The input with any explicit prefix removed. */
  readonly spec: string
  /** `explicit` when the person named the kind, `path` when a local Skill file decided it. */
  readonly reason: 'explicit' | 'path' | 'plugin-syntax'
}

/** Prefixes that name the kind outright. */
const PREFIX = /^(skill|mcp|plugin)\s*:\s*(.+)$/i

/** A local absolute or explicitly relative path, as Windows or POSIX text. */
const LOCAL_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\.{1,2}[\\/]|\/)/

/** A file that makes a local path a Skill source. */
const SKILL_FILE = /(?:^|[\\/])SKILL\.md$/i

/**
 * Classify the field's text without asking the Host anything.
 *
 * A prefixed input is final: nothing downstream may reinterpret it, which is
 * what makes "I said skill" reliable even when the network or the classifier
 * service is unavailable. An unprefixed local path is only a Skill when the
 * path itself names SKILL.md; anything else stays on the plugin path, whose
 * inspector still refuses what it cannot install.
 * @param raw - the text someone typed.
 * @returns the kind, the spec to install, and which rule decided it.
 */
export function classifyInstallInput(raw: string): ClassifiedInput {
  const trimmed = raw.trim()
  const prefixed = PREFIX.exec(trimmed)
  if (prefixed !== null) {
    return {
      kind: (prefixed[1] as string).toLowerCase() as InstallKind,
      spec: (prefixed[2] as string).trim(),
      reason: 'explicit',
    }
  }
  if (LOCAL_PATH.test(trimmed) && SKILL_FILE.test(trimmed)) {
    return { kind: 'skill', spec: trimmed, reason: 'path' }
  }
  return { kind: 'plugin', spec: trimmed, reason: 'plugin-syntax' }
}

/** Whether the input names its kind, so the dialog can skip the inspector entirely. */
export function isExplicitKind(raw: string): boolean {
  return PREFIX.test(raw.trim())
}
