/**
 * Shared declarations for package.json fields and plugin display metadata.
 * Each reader owns JSON validation and resolved defaults.
 * @module @liusiqi-dev/sqh-package-manifest/types
 */

/** Package identity and metadata; local profile readers may accept a partial declaration. */
export interface SqhPackageManifest {
  /** Published npm package name. */
  name: string
  /** Published npm package version. */
  version: string
  /** Package summary for discovery and display. */
  description?: string
  /** SVG, PNG, JPEG, or WebP file relative to this manifest's directory, at most 256 KiB and contained there after realpath resolution. */
  icon?: string
  /** Prevent npm publication, for example for local profile projects. */
  private?: boolean
  /** Packages installed alongside this package. */
  dependencies?: Record<string, string>
  /** Compatible versions of packages supplied by the consuming project. */
  peerDependencies?: Record<string, string>
  /** Runtime requirements; SQH compatibility is declarative until a reader enforces it. */
  engines?: SqhEnginesManifest
  /** SQH-specific author declarations. */
  sqh?: SqhManifest
  /**
   * The same declarations under the retired key.
   *
   * Readers accept both while manifests written by earlier versions still exist;
   * writers mirror both until no supported version reads this one. Read it through
   * `readSqhField` in `app-boot` rather than touching the field directly.
   */
  dsh?: SqhManifest
}

/**
 * Public author fields under `package.json.sqh`; a package may declare several roles.
 *
 * Two keys below used to be declared ad hoc at their readers — an `as { sqh?: ... }`
 * cast in the packer and a local `interface` in the catalog generator. Naming them
 * here makes this type the single source, so a rename becomes something the compiler
 * can enforce instead of something a text search has to notice.
 */
export interface SqhManifest {
  /** Manifest format version, independent of the npm package and Session format versions. */
  manifestVersion?: 1
  /** Bundle metadata consumed by the profile launcher. */
  bundle?: SqhBundleManifest
  /** Profile metadata consumed by the profile launcher. */
  profile?: SqhProfileManifest
  /** Client module loading and build metadata. */
  client?: SqhClientManifest
  /** Virtual file system trees the packed image mounts; entries are validated at read time. */
  readonly configTrees?: readonly unknown[]
  /** Session format migration declarations, validated by the catalog generator. */
  readonly sessionFormatMigration?: Readonly<Record<string, unknown>>
}

/** Literal text or translations indexed by lowercase language id, with a required English fallback. */
export type LocalizedText = string | { readonly en: string; readonly [locale: string]: string }

/** Validated plugin display fields and diagnostics from exported locales, manifests, or icon files. */
export interface PluginLocalizedMeta {
  /** Display title; omission preserves the consumer's technical-name fallback. */
  readonly title?: LocalizedText
  /** Display introduction after locale and package-field fallback. */
  readonly description?: LocalizedText
  /** Base64 image data URL read from the manifest's icon file; render as an image, not inline markup. */
  readonly icon?: string
  /** Unmodified local metadata diagnostic; the plugin remains manageable. */
  readonly error?: string
}

/** Runtime version requirements under `package.json.engines`. */
export interface SqhEnginesManifest {
  /** Compatible SQH versions as a SemVer range, including an exact version. */
  dsh?: string
  /** Compatible Node.js versions. */
  node?: string
  /** Compatible npm versions. */
  npm?: string
  /** Requirements for additional runtimes or package managers. */
  [engine: string]: string | undefined
}

/** The configuration layer exported by a bundle package. */
export interface SqhBundleManifest {
  /** One patch file path, or an ordered list applied in sequence, each relative to the declaring package root. */
  patch: string | string[]
}

/** The bundle composition declared by a profile directory. */
export interface SqhProfileManifest {
  /** Ordered bundle layer list, using installed package names. */
  bundles?: string[]
}

/** Client module declaration read by client-modules and the client build. */
export interface SqhClientManifest {
  /** Client platform identifier; the Web consumer selects `web`. */
  platform: string
  /** Informational package-name dependencies, not Cordis service injection. */
  inject?: string[]
  /** Boot phase-one registration barrier; absent means the shared application batch. */
  immediately?: boolean
  /**
   * Exact module-table requests beyond the implicit client baseline, including
   * subpaths such as `<pkg>/client`; absent means baseline externals only.
   * Type-only imports are erased and create no module request.
   */
  external?: string[]
}
