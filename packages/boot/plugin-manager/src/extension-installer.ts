/**
 * Install one extension at the location its kind requires, and record it in
 * the shared inventory.
 *
 * Three loaders read three different places: plugin bundles are profile
 * dependencies, Skills are SKILL.md directories, MCP servers are Cordis patch
 * rows. This module keeps those writes apart behind one entry point, and makes
 * the inventory authoritative for "already installed" so a second install
 * updates or refuses instead of silently duplicating files. It owns no network
 * and no pnpm invocation: the caller supplies the bytes and the plugin installer.
 * @module @liusiqi-dev/sqh-plugin-manager/extension-installer
 */

import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@liusiqi-dev/sqh-atomic-write'
import { resolveSqhHome } from '@liusiqi-dev/sqh-home-paths'
import { isMap, isSeq, parseDocument } from 'yaml'
import {
  findExtension, registerExtension, unregisterExtension, type ExtensionKind, type ExtensionRecord,
} from './extension-registry.ts'

/** A Skill directory name, as `skill-filesystem` reads it. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** An MCP server id, as `mcp-client` reads `serverName`. */
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/

/** One MCP server's connection settings, matching `sqh-mcp-client`'s config union. */
export type McpServerConfig =
  | { readonly transport: 'stdio'; readonly command: string; readonly args?: readonly string[]; readonly env?: Readonly<Record<string, string>> }
  | { readonly transport: 'streamable-http'; readonly url: string; readonly headers?: Readonly<Record<string, string>> }

/** The outcome the panel needs to report an install. */
export interface ExtensionInstallResult {
  readonly kind: ExtensionKind
  readonly name: string
  readonly location: string
  readonly action: 'installed' | 'updated' | 'already-installed'
  readonly record: ExtensionRecord
}

/** A plugin installer injected by the manager, which owns the pnpm/patch machinery. */
export type PluginInstaller = (name: string, source: string) => Promise<{ location: string; revision?: string }>

/** Common options: where SQODE_HOME is and the original source spec. */
export interface ExtensionInstallOptions {
  readonly home?: string
  readonly source: string
  /** An explicit revision (commit SHA or version), when the source supplied one. */
  readonly revision?: string
  /** Install a plugin through the manager's existing path. */
  readonly installPlugin?: PluginInstaller
  /** A second install of the same kind+name updates rather than refuses when true. */
  readonly update?: boolean
  /** Verbatim SKILL.md, required for a Skill install. */
  readonly contents?: string
  /** MCP connection settings, required for an MCP install. */
  readonly config?: McpServerConfig
}

/** A failed install with a message the dialog can show verbatim. */
export class ExtensionInstallError extends Error {
  constructor(readonly code: 'already-installed' | 'invalid-name' | 'invalid-content' | 'not-registered', message: string) {
    super(message)
    this.name = 'ExtensionInstallError'
  }
}

/** Write one Skill directory under SQODE_HOME/skills/<name>. */
async function writeSkill(home: string | undefined, name: string, contents: string): Promise<string> {
  if (!SKILL_NAME.test(name)) throw new ExtensionInstallError('invalid-name', `invalid Skill name: ${name}`)
  if (contents.trim() === '') throw new ExtensionInstallError('invalid-content', `empty SKILL.md for ${name}`)
  const root = join(resolveSqhHome(home), 'skills', name)
  await mkdir(root, { recursive: true, mode: 0o700 })
  const path = join(root, 'SKILL.md')
  await writeFileAtomic(path, contents, { mode: 0o600 })
  return path
}

/** Append or replace one MCP server row inside the profile patch's insert sequence. */
async function writeMcpServer(patchPath: string, serverName: string, config: McpServerConfig): Promise<string> {
  if (!SERVER_NAME.test(serverName)) throw new ExtensionInstallError('invalid-name', `invalid MCP server name: ${serverName}`)
  if (config.transport === 'stdio' && config.command.trim() === '') throw new ExtensionInstallError('invalid-content', 'MCP stdio command must not be empty')
  if (config.transport === 'streamable-http' && config.url.trim() === '') throw new ExtensionInstallError('invalid-content', 'MCP url must not be empty')
  let text = '[]\n'
  try { text = await readFile(patchPath, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const document = parseDocument(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }] })
  const parseError = document.errors[0]
  if (parseError !== undefined) throw new ExtensionInstallError('invalid-content', `profile patch is not valid YAML: ${parseError.message}`)
  if (!isSeq(document.contents)) throw new ExtensionInstallError('invalid-content', 'profile patch must be a YAML sequence')
  const rows = document.contents.items
  let existing: (string | number)[] | undefined
  let firstInsert: (string | number)[] | undefined
  for (let index = 0; index < rows.length; index++) {
    if (!isMap(rows[index])) continue
    const inserted = document.getIn([index, 'insert'])
    if (!isSeq(inserted)) continue
    if (firstInsert === undefined) firstInsert = [index, 'insert']
    for (let rowIndex = 0; rowIndex < inserted.items.length; rowIndex++) {
      if (document.getIn([index, 'insert', rowIndex, 'id']) === `mcp-${serverName}`
        && document.getIn([index, 'insert', rowIndex, 'name']) === '@liusiqi-dev/sqh-mcp-client') {
        existing = [index, 'insert', rowIndex]
        break
      }
    }
    if (existing !== undefined) break
  }
  const row = {
    id: `mcp-${serverName}`,
    name: '@liusiqi-dev/sqh-mcp-client',
    config: { serverName, transport: config.transport,
      ...(config.transport === 'stdio'
        ? { command: config.command,
          ...config.args === undefined ? {} : { args: [...config.args] },
          ...config.env === undefined ? {} : { env: { ...config.env } } }
        : { url: config.url, ...config.headers === undefined ? {} : { headers: { ...config.headers } } }) },
  }
  if (existing !== undefined) document.setIn(existing, row)
  else if (firstInsert !== undefined && isSeq(document.getIn(firstInsert))) document.addIn(firstInsert, row)
  else document.add({ insert: [row] })
  await writeFileAtomic(patchPath, `${String(document)}\n`, { mode: 0o600 })
  return patchPath
}

/**
 * Install one extension and register it. A same-kind/same-name entry in the
 * inventory is an `already-installed` refusal unless `update` was requested;
 * the inventory, not the filesystem, decides.
 */
export async function installExtension(
  kind: ExtensionKind, name: string, options: ExtensionInstallOptions,
): Promise<ExtensionInstallResult> {
  if (kind === 'plugin' && name.trim() === '') throw new ExtensionInstallError('invalid-name', 'plugin name must not be empty')
  if (kind !== 'plugin') {
    if (kind === 'skill' && !SKILL_NAME.test(name)) throw new ExtensionInstallError('invalid-name', `invalid Skill name: ${name}`)
    if (kind === 'mcp' && !SERVER_NAME.test(name)) throw new ExtensionInstallError('invalid-name', `invalid MCP server name: ${name}`)
  }
  const previous = await findExtension(options.home, kind, name)
  if (previous !== undefined && options.update !== true) {
    return { kind, name, location: previous.location, action: 'already-installed', record: previous }
  }
  let location: string
  if (kind === 'plugin') {
    if (options.installPlugin === undefined) throw new ExtensionInstallError('not-registered', 'no plugin installer was supplied')
    const result = await options.installPlugin(name, options.source)
    location = result.location
  } else if (kind === 'skill') {
    if (typeof options.contents !== 'string') throw new ExtensionInstallError('invalid-content', 'SKILL.md contents are required')
    location = await writeSkill(options.home, name, options.contents)
  } else {
    if (options.config === undefined) throw new ExtensionInstallError('invalid-content', 'MCP server config is required')
    location = await writeMcpServer(join(resolveSqhHome(options.home), 'profiles', 'desktop', 'cordis.patch.yml'), name, options.config)
  }
  const { record } = await registerExtension(options.home, {
    kind, name, source: options.source, location,
    ...options.revision === undefined ? {} : { revision: options.revision },
  })
  return { kind, name, location, action: previous === undefined ? 'installed' : 'updated', record }
}

/** Remove one registered extension's exact path and its inventory row. */
export async function uninstallExtension(
  home: string | undefined, kind: ExtensionKind, name: string,
): Promise<boolean> {
  const record = await findExtension(home, kind, name)
  if (record === undefined) return false
  // A plugin's files belong to pnpm and are removed through the profile; only
  // Skill/MCP entries own a single path they wrote themselves.
  if (kind !== 'plugin') await rm(record.location, { force: true })
  await unregisterExtension(home, kind, name)
  return true
}
