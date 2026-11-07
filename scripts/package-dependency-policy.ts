/** Explicit exceptions and Host packages for the published dependency policy. */

/** Packages treated as Client/Host packages without declaring `dsh.client`. */
const CLIENT_FACE_INCLUDE: readonly string[] = []

/** Packages exempted from automatic Client/Host treatment despite declaring `dsh.client`. */
const CLIENT_FACE_EXCLUDE: readonly string[] = [
  '@liusiqi-dev/sqh-api-session-controller',
  '@liusiqi-dev/sqh-api-workspace-controller',
]

/** Host-only packages whose peer relays are deliberately flattened. */
const HOST_DEPENDENCY_PACKAGES: readonly string[] = [
  '@liusiqi-dev/sqh-llm',
  '@liusiqi-dev/sqh-session',
]

/** Development-only package relationships not represented by source imports. */
const CONFIGURATION_ONLY_DEV_DEPENDENCIES = {
  '@liusiqi-dev/sqh-client-locale': ['@liusiqi-dev/sqh-api-remotes'],
  '@liusiqi-dev/sqh-client-ui-conversation': [
    '@liusiqi-dev/sqh-api-remotes',
    '@liusiqi-dev/sqh-client-ui-workspace',
  ],
  '@liusiqi-dev/sqh-client-ui-model-selection': ['@liusiqi-dev/sqh-client-ui-input-trigger'],
  '@liusiqi-dev/sqh-client-ui-sidebar': ['@liusiqi-dev/sqh-client-ui-workspace'],
  '@liusiqi-dev/sqh-client-ui-subagent': ['@liusiqi-dev/sqh-client-ui-input-trigger'],
  '@liusiqi-dev/sqh-client-ui-theme': ['@liusiqi-dev/sqh-api-remotes'],
  '@liusiqi-dev/sqh-client-ui-tool': ['@liusiqi-dev/sqh-api-remotes'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** Workspace packages whose complete runtime surface is safe across duplicate installations. */
const DUPLICATE_SAFE_PACKAGES: readonly string[] = [
  '@liusiqi-dev/sqh-brand',
  '@liusiqi-dev/sqh-lazy-require',
  '@liusiqi-dev/sqh-typert-protocol',
  '@liusiqi-dev/sqh-util-code-language',
  '@liusiqi-dev/sqh-util-crypto',
  '@liusiqi-dev/sqh-util-values',
]

/**
 * Runtime exports whose values remain valid when npm installs another package copy.
 * New entries are forbidden by default. Automated agents must not add an
 * exception; every addition requires explicit human review and a dedicated,
 * prominent heading in the pull request description.
 */
const SAFE_HOST_DEPENDENCY_EXPORTS = {
  '@liusiqi-dev/sqh-credentials': ['credentialKey'],
  '@liusiqi-dev/sqh-deque': ['Deque'],
  '@liusiqi-dev/sqh-llm': ['callConfigEquals'],
  '@liusiqi-dev/sqh-session-format': ['sessionFormatLogFilename'],
  '@liusiqi-dev/sqh-timeout': ['MAX_TIMER_DELAY_MS'],
  '@liusiqi-dev/schemastery': ['default'],
} as const satisfies HostDependencyExports

/** Runtime exports that require every consumer to resolve the provider's shared peer instance. */
const PEER_REQUIRED_HOST_EXPORTS = {
  '@liusiqi-dev/sqh-client-connection': ['OperatorPeer'],
  '@liusiqi-dev/sqh-subprocess': ['SubprocessExecutableNotFoundError'],
  '@liusiqi-dev/sqh-scope': ['carrierKeyOf', 'createScope', 'scopeOf', 'scopeTarget'],
  '@liusiqi-dev/sqh-session': ['SESSION_FORMAT_VERSION'],
  '@liusiqi-dev/sqh-session-persistence': ['SessionPersistenceNotFoundError'],
} as const satisfies HostDependencyExports

/** Exact import specifier to reviewed runtime exports. */
type HostDependencyExports = Readonly<Record<string, readonly string[]>>

/** Complete configurable input to package dependency classification. */
export interface PackageDependencyPolicy {
  readonly clientFaceInclude: readonly string[]
  readonly clientFaceExclude: readonly string[]
  readonly hostPackages: readonly string[]
  readonly configurationOnlyDevDependencies: Readonly<Record<string, readonly string[]>>
  readonly duplicateSafePackages?: readonly string[]
  readonly safeHostDependencyExports: HostDependencyExports
  readonly peerRequiredHostExports: HostDependencyExports
}

/** Repository dependency policy consumed by verification and benchmarking. */
export const PACKAGE_DEPENDENCY_POLICY: PackageDependencyPolicy = {
  clientFaceInclude: CLIENT_FACE_INCLUDE,
  clientFaceExclude: CLIENT_FACE_EXCLUDE,
  hostPackages: HOST_DEPENDENCY_PACKAGES,
  configurationOnlyDevDependencies: CONFIGURATION_ONLY_DEV_DEPENDENCIES,
  duplicateSafePackages: DUPLICATE_SAFE_PACKAGES,
  safeHostDependencyExports: SAFE_HOST_DEPENDENCY_EXPORTS,
  peerRequiredHostExports: PEER_REQUIRED_HOST_EXPORTS,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a package manifest declares a dynamically loaded Client entry. */
export function hasClientDeclaration(sqhField: unknown): boolean {
  return isRecord(sqhField) && Object.hasOwn(sqhField, 'client')
}

/** Whether the repository policy flattens one package's non-Cordis peers. */
export function usesFlattenedPackageDependencies(
  manifestPath: string,
  packageName: string,
  sqhField: unknown,
  policy: PackageDependencyPolicy = PACKAGE_DEPENDENCY_POLICY,
): boolean {
  if (!manifestPath.startsWith('packages/') || manifestPath.startsWith('packages/experimental/')) return false
  if (policy.hostPackages.includes(packageName)) return true
  if (manifestPath.startsWith('packages/client/')) return true
  const included = hasClientDeclaration(sqhField) || policy.clientFaceInclude.includes(packageName)
  return included && !policy.clientFaceExclude.includes(packageName)
}
