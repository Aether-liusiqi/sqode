/**
 * Place non-plugin extensions where their loaders actually look.
 *
 * A Skill is a directory containing SKILL.md under SQODE_HOME/skills; an MCP
 * server is one `sqh-mcp-client` insert row in a profile's Cordis patch. Both
 * are plain, atomic file writes: the loaders watch those locations, so no
 * package manager and no reload handshake is needed for a new file to appear.
 * Plugin bundles keep using `installBundle` and are deliberately absent here.
 * @module @liusiqi-dev/sqh-plugin-manager/install-executors
 */

import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@liusiqi-dev/sqh-atomic-write'
import { resolveSqhHome } from '@liusiqi-dev/sqh-home-paths'
import { isMap, isSeq, parseDocument } from 'yaml'

/** A Skill directory name, as `skill-filesystem` reads it. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** An MCP server id, as `mcp-client` reads `serverName`. */
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/

/** The file a Skill must contain at its root. */
export const SKILL_FILENAME = 'SKILL.md'

/** Result of placing one extension, for the install dialog's summary. */
export interface InstallPlacement {
  readonly kind: 'skill' | 'mcp'
  readonly name: string
  readonly path: string
  /** Whether an existing entry was replaced rather than created. */
  readonly replaced: boolean
}

/**
 * Write a Skill's SKILL.md under SQODE_HOME/skills/<name>/.
 * @param home - SQODE_HOME override, defaulted from the environment.
 * @param name - kebab-case skill directory name.
 * @param contents - verbatim SKILL.md text; its frontmatter is the loader's contract.
 */
export async function installSkill(home: string | undefined, name: string, contents: string): Promise<InstallPlacement> {
  if (!SKILL_NAME.test(name)) throw new Error(`plugin-manager: invalid skill name: ${name}`)
  if (contents.trim() === '') throw new Error(`plugin-manager: empty SKILL.md for ${name}`)
  const root = join(resolveSqhHome(home), 'skills', name)
  const path = join(root, SKILL_FILENAME)
  let replaced = false
  try {
    await readFile(path, 'utf8')
    replaced = true
  } catch { /* a new skill simply has no prior file */ }
  await mkdir(root, { recursive: true, mode: 0o700 })
  await writeFileAtomic(path, contents, { mode: 0o600 })
  return { kind: 'skill', name, path, replaced }
}

/** One MCP server's connection settings, matching `sqh-mcp-client`'s config union. */
export type McpServerConfig =
  | { readonly transport: 'stdio'; readonly command: string; readonly args?: readonly string[]; readonly env?: Readonly<Record<string, string>> }
  | { readonly transport: 'streamable-http'; readonly url: string; readonly headers?: Readonly<Record<string, string>> }

/**
 * Append or update one MCP server row in a profile's Cordis patch. The
 * document is parsed and re-emitted with yaml so comments and unrelated rows
 * stay in place; the `!!js process.cwd()` form used by the shipped MCP example
 * is not emitted because a persisted absolute cwd would break on relocation.
 * @param patchPath - the profile's `cordis.patch.yml`.
 * @param serverName - the MCP client's `serverName`.
 * @param config - stdio or HTTP connection settings.
 */
export async function installMcpServer(patchPath: string, serverName: string, config: McpServerConfig): Promise<InstallPlacement> {
  if (!SERVER_NAME.test(serverName)) throw new Error(`plugin-manager: invalid MCP server name: ${serverName}`)
  if (config.transport === 'stdio' && config.command.trim() === '') throw new Error('plugin-manager: MCP stdio command must not be empty')
  if (config.transport === 'streamable-http' && config.url.trim() === '') throw new Error('plugin-manager: MCP url must not be empty')
  let text = '[]\n'
  try {
    text = await readFile(patchPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const document = parseDocument(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }] })
  const error = document.errors[0]
  if (error !== undefined) throw error
  if (!isSeq(document.contents)) throw new Error('Profile patch must be a YAML sequence')
  const rows = document.contents.items
  // MCP rows live inside an `insert` sequence, not at the patch's top level.
  let existing: (string | number)[] | undefined
  let firstInsert: (string | number)[] | undefined
  for (let index = 0; index < rows.length; index++) {
    const item = rows[index]
    if (!isMap(item)) continue
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
    config: { serverName, ...('args' in config && config.args !== undefined ? { args: [...config.args] } : {}),
      ...('env' in config && config.env !== undefined ? { env: { ...config.env } } : {}),
      ...('headers' in config && config.headers !== undefined ? { headers: { ...config.headers } } : {}),
      transport: config.transport,
      ...(config.transport === 'stdio' ? { command: config.command } : { url: config.url }) },
  }
  if (existing !== undefined) document.setIn(existing, row)
  else if (firstInsert !== undefined) {
    const inserted = document.getIn(firstInsert)
    if (isSeq(inserted)) inserted.add(row)
  } else document.add({ insert: [row] })
  await writeFileAtomic(patchPath, `${String(document)}\n`, { mode: 0o600 })
  return { kind: 'mcp', name: serverName, path: patchPath, replaced: existing !== undefined }
}
