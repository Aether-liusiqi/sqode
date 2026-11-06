/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@liusiqi-dev/cordis'
import productAnalyticsRemote from '@liusiqi-dev/sqh-client-product-analytics/remote'
export type {} from '@liusiqi-dev/sqh-client-product-analytics/remote'
import agentPresetsRemote from '@liusiqi-dev/sqh-agent-preset-registry/remote'
import userQuestionsRemote from '@liusiqi-dev/sqh-user-questions/remote'
import commandsRemote from '@liusiqi-dev/sqh-commands/remote'
import accountRemote from '@liusiqi-dev/sqh-api-account-controller/remote'
import settingsControllerRemote from '@liusiqi-dev/sqh-api-settings-controller/remote'
import officeToPdfRemote from '@liusiqi-dev/sqh-office-to-pdf/remote'
import goalsRemote from '@liusiqi-dev/sqh-goal/remote'
import scheduleRemote from '@liusiqi-dev/sqh-schedule/remote'
import llmRemote from '@liusiqi-dev/sqh-llm/remote'
import dynamicRemote from '@liusiqi-dev/sqh-cordis-host-runner/remote'
import pluginManagerRemote from '@liusiqi-dev/sqh-plugin-manager/remote'
import pluginRegistryProbeRemote from '@liusiqi-dev/sqh-client-ui-plugin-manager/remote'
import pluginInventoryRemote from '@liusiqi-dev/sqh-host-plugin-inventory/remote'
import messageFeedbackRemote from '@liusiqi-dev/sqh-message-feedback/remote'
import permissionPresetsRemote from '@liusiqi-dev/sqh-permission-presets/remote'
import sessionFeedbackRemote from '@liusiqi-dev/sqh-command-feedback/remote'
import fileUploadsRemote from '@liusiqi-dev/sqh-client-file-upload/remote'
import sessionReferencesRemote from '@liusiqi-dev/sqh-session-reference/remote'
import subagentsRemote from '@liusiqi-dev/sqh-subagent/remote'
import sessionRemote from '@liusiqi-dev/sqh-api-session-controller/remote'
import jobRemote from '@liusiqi-dev/sqh-api-job-controller/remote'
import workspaceRemote from '@liusiqi-dev/sqh-api-workspace-controller/remote'
import terminalRemote from '@liusiqi-dev/sqh-api-terminal-controller/remote'
import workspaceFilesRemote from '@liusiqi-dev/sqh-api-workspace-files/remote'
import type { ClientRemote } from '@liusiqi-dev/sqh-api-gateway/client'

export type { ClientRemote } from '@liusiqi-dev/sqh-api-gateway/client'
export type {
  BundleInfo, BundleRowInfo, ChangeResult, IncompatiblePlugin, InspectOptions, InstallBundleOptions, InstallSpecKind, ManagementError,
  PackageResult,
  PluginChange, PluginEntryId, PluginInfo, PluginInspectProblem, PluginInstallCancellation, PluginInstallFailureKind,
  PluginInstallLogChunk, PluginInstallProgress, PluginInstallRequestId, PluginRegistries, PluginSpecInspection, ReadOnlyReason, Registry,
} from '@liusiqi-dev/sqh-plugin-manager/types'
export type {} from '@liusiqi-dev/sqh-plugin-manager/remote'
export type {} from '@liusiqi-dev/sqh-client-ui-plugin-manager/remote'
export type { PluginInventorySnapshot } from '@liusiqi-dev/sqh-host-plugin-inventory/types'
export type {} from '@liusiqi-dev/sqh-agent-preset-registry/remote'
export type {} from '@liusiqi-dev/sqh-user-questions/remote'
export type {} from '@liusiqi-dev/sqh-commands/remote'
export type {} from '@liusiqi-dev/sqh-api-settings-controller/remote'
export type {} from '@liusiqi-dev/sqh-api-account-controller/remote'
export type {} from '@liusiqi-dev/sqh-goal/remote'
export type {} from '@liusiqi-dev/sqh-schedule/remote'
export type {} from '@liusiqi-dev/sqh-office-to-pdf/remote'
export type {} from '@liusiqi-dev/sqh-llm/remote'
export type {} from '@liusiqi-dev/sqh-host-plugin-inventory/remote'
export type {} from '@liusiqi-dev/sqh-message-feedback/remote'
export type {} from '@liusiqi-dev/sqh-permission-presets/remote'
export type {} from '@liusiqi-dev/sqh-command-feedback/remote'
export type {} from '@liusiqi-dev/sqh-client-file-upload/remote'
export type {} from '@liusiqi-dev/sqh-session-reference/remote'
export type {} from '@liusiqi-dev/sqh-subagent/remote'
export type * from '@liusiqi-dev/sqh-subagent/client'
export type {} from '@liusiqi-dev/sqh-api-session-controller/remote'
export type * from '@liusiqi-dev/sqh-api-session-controller/types'
export type {} from '@liusiqi-dev/sqh-api-job-controller/remote'
export type * from '@liusiqi-dev/sqh-api-job-controller/types'
export type {} from '@liusiqi-dev/sqh-api-workspace-controller/remote'
export type * from '@liusiqi-dev/sqh-api-workspace-controller/types'
export type {} from '@liusiqi-dev/sqh-api-workspace-files/remote'
export type * from '@liusiqi-dev/sqh-api-workspace-files/types'
export type {} from '@liusiqi-dev/sqh-api-terminal-controller/remote'
export type * from '@liusiqi-dev/sqh-api-terminal-controller/types'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe `./types` exports supply the `Events`
// signatures `$on` hands to a listener, so a consumer reads the very
// declaration the Host emits rather than a flattened restatement of it.
export type {} from '@liusiqi-dev/sqh-commands/types'
export type {} from '@liusiqi-dev/sqh-cordis-host-runner/types'
export type {} from '@liusiqi-dev/sqh-credentials/types'
export type {} from '@liusiqi-dev/sqh-llm/types'
export type {} from '@liusiqi-dev/sqh-agent-preset-registry/types'
export type {} from '@liusiqi-dev/sqh-permission-presets/types'
export type {} from '@liusiqi-dev/sqh-settings/types'
export type {} from '@liusiqi-dev/sqh-user-approval/types'
export type {} from '@liusiqi-dev/sqh-user-questions/types'
export type {} from '@liusiqi-dev/sqh-api-session-controller/types'

/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type {
  ConnectionHandle, ConnectionSinks, ContentBlock,
  MessageId,
  RpcId, RpcRequest, RpcResponse, RpcResult, SessionId,
  StreamChunk,
} from '@liusiqi-dev/sqh-client-connection/client'
export type {} from '@liusiqi-dev/sqh-api-gateway/client'
export type {} from '@liusiqi-dev/sqh-cordis-host-runner/remote'

// The payload vocabulary of the selected namespaces, re-exported so a Client
// contribution can name what it sends and receives without importing a Host
// package: this assembly is the one place both planes legitimately meet.
export type {
  ApprovalRequestId,
  CordisHalfState,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisDynamicRunMode,
  CordisInspectMethodManifest,
  CordisInspectPlatform,
  CordisInspectProviderManifest,
  CordisInspectProviderView,
  CordisInspectQueryRequest,
  CordisInspectQueryResolution,
  CordisInspectQueryResolved,
  CordisInspectRequestId,
  CordisInspectResolveAck,
  CordisRunDiagnostic,
  CordisRunStatus,
  DynamicCordisClientSource,
  DynamicCordisHostHalfResult,
  DynamicCordisInventoryRow,
  DynamicCordisInvokeResult,
  DynamicCordisPackage,
  DynamicCordisRequestResolved,
  DynamicCordisResolveAck,
  DynamicCordisRetracted,
  DynamicCordisRunRequest,
  DynamicCordisRunResolution,
  DynamicCordisRunAttempt,
  DynamicCordisRunResponse,
  DynamicCordisStopResponse,
  DynamicCordisUndefineReceipt,
  RequestRunOutcome,
} from '@liusiqi-dev/sqh-cordis-host-runner/types'
// Credential state vocabulary for the credentials namespace (values never ride it).
export type { CredentialInfo } from '@liusiqi-dev/sqh-credentials/types'
// Redacted namespace vocabulary for the settings namespace (secrets never ride
// it). It travels with its seam, whose `./types` the Client face already reads.
export type {
  SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView, SettingsSecretView,
} from '@liusiqi-dev/sqh-settings/types'
// Provider registry and discovery vocabulary for the llm namespace.
export type {
  LlmConfigurableProvider, LlmDiscoveredModel,
  LlmModelDiscoveryRequest, LlmProviderInfo,
} from '@liusiqi-dev/sqh-llm/types'
// Reference-discovery result vocabulary for the fileReferences and
// sessionReferenceResolver namespaces.
export type { FileReferenceCandidate } from '@liusiqi-dev/sqh-file-reference/types'
export type { SessionReferenceMentionCandidate } from '@liusiqi-dev/sqh-session-reference/types'

// The Remote failure vocabulary, re-exported so business packages keep naming
// this assembly alone. Types only: a value export would make spec imports load
// this module's owner /remote artifacts; specs take RemoteError from
// dsh-client-test-runtime instead.
export type {
  RemoteErrorCode, RemoteErrorDetailsMap, RemoteFailure, RemoteResult,
} from '@liusiqi-dev/sqh-typert-protocol'
export type { RemoteHostFacts } from '@liusiqi-dev/sqh-api-gateway/client'

declare module '@liusiqi-dev/cordis' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: ClientRemote
  }
}

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = []
  try {
    for (const contribution of [
      productAnalyticsRemote, agentPresetsRemote, commandsRemote, settingsControllerRemote, accountRemote,
      goalsRemote, llmRemote, dynamicRemote, scheduleRemote,
      pluginInventoryRemote, pluginManagerRemote, pluginRegistryProbeRemote, messageFeedbackRemote, sessionFeedbackRemote,
      fileUploadsRemote, sessionReferencesRemote,
      permissionPresetsRemote, subagentsRemote, sessionRemote, jobRemote, workspaceRemote, workspaceFilesRemote, terminalRemote,
      officeToPdfRemote, userQuestionsRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
