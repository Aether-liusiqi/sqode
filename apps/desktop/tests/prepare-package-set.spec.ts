import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertDesktopHostPackageFiles,
  selectDesktopPackageClosure,
  type PackedDesktopPackage,
} from '../scripts/prepare-package-set.ts'

function packed(name: string, manifest: Record<string, unknown> = {}): PackedDesktopPackage {
  return { tarball: `${name}.tgz`, manifest: { name, version: '1.0.0', ...manifest } }
}

describe('desktop package-set selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not select a packaging target when imported as a library', async () => {
    vi.stubEnv('SQODE_DESKTOP_TARGET_PLATFORM', 'linux')
    vi.stubEnv('SQODE_DESKTOP_TARGET_ARCH', 'x64')
    vi.resetModules()
    await expect(import('../scripts/prepare-package-set.ts')).resolves.toHaveProperty('prepareDesktopPackageSet')
  })

  it('includes only the available internal production closure', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@liusiqi-dev/sqode', packed('@liusiqi-dev/sqode', {
        dependencies: { '@liusiqi-dev/dsh-base': '^1.0.0', external: '^2.0.0' },
        optionalDependencies: { '@liusiqi-dev/platform-package': '1.0.0', '@liusiqi-dev/missing-platform': '1.0.0' },
      })],
      ['@liusiqi-dev/dsh-desktop-host', packed('@liusiqi-dev/dsh-desktop-host', {
        dependencies: { '@liusiqi-dev/sqode': '^1.0.0' },
      })],
      ['@liusiqi-dev/dsh-base', packed('@liusiqi-dev/dsh-base', {
        peerDependencies: { '@liusiqi-dev/cordis': '^1.0.0' },
      })],
      ['@liusiqi-dev/cordis', packed('@liusiqi-dev/cordis')],
      ['@liusiqi-dev/platform-package', packed('@liusiqi-dev/platform-package')],
      ['@liusiqi-dev/unused', packed('@liusiqi-dev/unused')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@liusiqi-dev/cordis',
      '@liusiqi-dev/sqode',
      '@liusiqi-dev/dsh-base',
      '@liusiqi-dev/dsh-desktop-host',
      '@liusiqi-dev/platform-package',
    ])
  })

  it.each([
    '@liusiqi-dev/dsh-base', '@liusiqi-dev/cordis', '@liusiqi-dev/node-addon-system',
  ])('rejects required prepared package %s absent from the packed release inputs', (dependency) => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@liusiqi-dev/sqode', packed('@liusiqi-dev/sqode', {
        dependencies: { [dependency]: '^1.0.0' },
      })],
      ['@liusiqi-dev/dsh-desktop-host', packed('@liusiqi-dev/dsh-desktop-host', {
        dependencies: { '@liusiqi-dev/sqode': '^1.0.0' },
      })],
    ])
    expect(() => selectDesktopPackageClosure(available)).toThrow(/unpacked package/u)
    expect(() => selectDesktopPackageClosure(new Map([
      ['@liusiqi-dev/sqode', packed('@liusiqi-dev/sqode')],
    ]))).toThrow(/omit @liusiqi-dev\/dsh-desktop-host/u)
  })

  it('leaves independently published Office packages to npm resolution', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@liusiqi-dev/sqode', packed('@liusiqi-dev/sqode', {
        dependencies: {
          '@deepseek-ai/libreoffice-kit': '0.0.1',
          '@deepseek-ai/libreoffice-kit-wasm': '0.0.1',
        },
      })],
      ['@liusiqi-dev/dsh-desktop-host', packed('@liusiqi-dev/dsh-desktop-host')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@liusiqi-dev/sqode', '@liusiqi-dev/dsh-desktop-host',
    ])
  })

  it('requires both Desktop Host and public CLI entries', () => {
    const files = [
      'package/lib/index.js',
      'package/lib/cli.js',
    ]
    expect(() => {
      assertDesktopHostPackageFiles(files)
    }).not.toThrow()
    expect(() => {
      assertDesktopHostPackageFiles(files.slice(1))
    }).toThrow(/lib\/index\.js/u)
    expect(() => { assertDesktopHostPackageFiles(files.slice(0, 1)) }).toThrow(/lib\/cli\.js/u)
  })
})
