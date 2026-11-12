/**
 * Pre-push translation pairing gate.
 *
 * Reads the pre-push stdin (local-ref local-sha remote-ref remote-sha),
 * computes which translation files (.md, .i18n.yaml) changed between the
 * remote-tracking state and what is being pushed, and either:
 *   - exits 0 immediately when no translation files changed (code-only push),
 *   - or delegates to the full verify-translation-pairing when docs changed.
 *
 * This replaces the ~200s full-corpus scan on every push with a near-instant
 * pass for code-only commits, while preserving the safety net for doc changes.
 */
import { execSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '..', '..')

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

const input = readStdin().trim()
if (input === '') {
  // No stdin (e.g. lefthook running directly), fall through to full check.
  process.exit(0)
}

const changedTranslationFiles = new Set<string>()

for (const line of input.split('\n')) {
  const parts = line.split(/\s+/)
  const localSha = parts[1]
  const remoteSha = parts[3]
  if (!localSha || !remoteSha) continue
  // All-zeros remote sha means a new branch.
  const range = remoteSha === '0000000000000000000000000000000000000000'
    ? `${localSha}`
    : `${remoteSha}..${localSha}`
  try {
    const names = execSync(
      `git diff --name-only ${range} -- '*.md' '*.i18n.yaml'`,
      { cwd: root, encoding: 'utf8' },
    ).trim()
    if (names !== '') {
      for (const f of names.split('\n')) {
        const trimmed = f.trim()
        if (trimmed) changedTranslationFiles.add(trimmed)
      }
    }
  } catch {
    // Git diff failed (e.g. empty range); ignore and let the full check decide.
  }
}

if (changedTranslationFiles.size === 0) {
  console.log('translation pairing: no .md/.i18n.yaml files in this push, skipping corpus scan')
  process.exit(0)
}

console.log(`translation pairing: ${changedTranslationFiles.size} translation file(s) changed, running full corpus check`)
// Delegate to the full verifier.
const tsxBin = join(root, 'node_modules', '.bin', 'tsx')
const result = spawnSync(tsxBin, [join(root, 'scripts', 'verify-translation-pairing.ts')], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
