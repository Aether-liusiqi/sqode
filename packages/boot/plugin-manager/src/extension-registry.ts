/**
 * One inventory for every extension Sqode itself has installed.
 *
 * A plugin, a Skill and an MCP server live in three different places and are
 * loaded by three different services. Without a shared inventory the panel
 * cannot tell "already installed" from "never touched", cannot uninstall
 * accurately, and mistakes a Skill sitting in Claude Code's directory for one
 * Sqode owns. This registry is that inventory: a small JSON file under SQODE_HOME
 * holding exactly what this installation placed, so lookups never guess from
 * directory shapes and a stale or corrupt file never blocks the manager.
 *
 * Nothing here installs or removes files: callers register a placement after
 * their own executor succeeded, and unregister before or after their own
 * removal. That keeps one source of truth for state without centralising
 * three unrelated loaders.
 * @module @liusiqi-dev/sqh-plugin-manager/extension-registry
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@liusiqi-dev/sqh-atomic-write'
import { resolveSqhHome } from '@liusiqi-dev/sqh-home-paths'

/** The extension kinds this manager can place. */
export type ExtensionKind = 'plugin' | 'skill' | 'mcp'

/** One installed extension, with the source it came from and where it landed. */
export interface ExtensionRecord {
  readonly kind: ExtensionKind
  /** The name under which the loader knows it: bundle package, skill dir, or MCP serverName. */
  readonly name: string
  /** The original spec (package name, URL, or path) used to install it. */
  readonly source: string
  /** A version, commit SHA, or content hash recorded at install time. */
  readonly revision?: string
  /** The exact path this installation wrote; removal never guesses beyond it. */
  readonly location: string
  readonly installedAt: string
  readonly enabled: boolean
}

/** On-disk shape: one version marker plus the records, keyed by kind and name. */
interface RegistryFile {
  readonly version: 1
  readonly extensions: readonly ExtensionRecord[]
}

/** The registry filename under SQODE_HOME. */
export const EXTENSION_REGISTRY_FILENAME = 'extensions.json'

/** Identity of a record: a name is only unique within its kind. */
export function recordKey(kind: ExtensionKind, name: string): string {
  return `${kind}:${name}`
}

/** Read the registry, treating a missing or malformed file as an empty inventory. */
export async function readRegistry(home?: string): Promise<RegistryFile> {
  const path = join(resolveSqhHome(home), EXTENSION_REGISTRY_FILENAME)
  try {
    const answer: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (typeof answer !== 'object' || answer === null) return { version: 1, extensions: [] }
    const candidate = answer as Partial<RegistryFile>
    if (candidate.version !== 1 || !Array.isArray(candidate.extensions)) return { version: 1, extensions: [] }
    return { version: 1, extensions: candidate.extensions.filter(isRecord) }
  } catch {
    return { version: 1, extensions: [] }
  }
}

/** Narrow one parsed array item to a record with all required fields. */
function isRecord(value: unknown): value is ExtensionRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<ExtensionRecord>
  return (record.kind === 'plugin' || record.kind === 'skill' || record.kind === 'mcp')
    && typeof record.name === 'string' && record.name !== ''
    && typeof record.source === 'string' && typeof record.location === 'string'
    && typeof record.installedAt === 'string' && typeof record.enabled === 'boolean'
}

/** Persist the registry atomically, preserving 0o600 / 0o700 permissions. */
export async function writeRegistry(home: string | undefined, registry: RegistryFile): Promise<void> {
  const path = join(resolveSqhHome(home), EXTENSION_REGISTRY_FILENAME)
  await writeFileAtomic(path, `${JSON.stringify(registry, undefined, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
}

/** List every recorded extension, or only one kind when asked. */
export async function listExtensions(home?: string, kind?: ExtensionKind): Promise<readonly ExtensionRecord[]> {
  const { extensions } = await readRegistry(home)
  return kind === undefined ? extensions : extensions.filter(record => record.kind === kind)
}

/** Find one record by kind and name, or undefined when Sqode never installed it. */
export async function findExtension(home: string | undefined, kind: ExtensionKind, name: string): Promise<ExtensionRecord | undefined> {
  const key = recordKey(kind, name)
  return (await listExtensions(home)).find(record => recordKey(record.kind, record.name) === key)
}

/**
 * Add or replace one record. A same-kind/same-name entry is updated in place so
 * an upgrade keeps its original install time orientation via a fresh record.
 * @returns the stored record and whether it replaced an earlier one.
 */
export async function registerExtension(
  home: string | undefined,
  record: Omit<ExtensionRecord, 'installedAt' | 'enabled'> & { installedAt?: string; enabled?: boolean },
): Promise<{ record: ExtensionRecord; replaced: boolean }> {
  const registry = await readRegistry(home)
  const key = recordKey(record.kind, record.name)
  const index = registry.extensions.findIndex(item => recordKey(item.kind, item.name) === key)
  const stored: ExtensionRecord = { ...record, enabled: record.enabled ?? true,
    installedAt: record.installedAt ?? new Date().toISOString() }
  const extensions = [...registry.extensions]
  if (index >= 0) extensions[index] = stored
  else extensions.push(stored)
  await writeRegistry(home, { version: 1, extensions })
  return { record: stored, replaced: index >= 0 }
}

/** Remove one record; a name Sqode never installed is a no-op. */
export async function unregisterExtension(home: string | undefined, kind: ExtensionKind, name: string): Promise<boolean> {
  const registry = await readRegistry(home)
  const key = recordKey(kind, name)
  const extensions = registry.extensions.filter(item => recordKey(item.kind, item.name) !== key)
  if (extensions.length === registry.extensions.length) return false
  await writeRegistry(home, { version: 1, extensions })
  return true
}
