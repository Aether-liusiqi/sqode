# Loadable Harness plugin packages

This file is GENERATED from workspace manifests (`scripts/gen-plugin-packages.ts`) and verified fresh by `pnpm run verify-plugin-packages` (part of `doc-sync`); do not edit it by hand.

Every package below exports a Cordis plugin that a bundle patch can name in a Loader row. `Config` marks packages whose row accepts a `config` mapping; query `Config.listConfigs` through `cordis_inspect_query` (filter by `name`, then query the `entry` id) for the mounted schema. Packages under `experimental` are pre-stable.

## acp

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-acp` | yes | Automation-only Agent Client Protocol server for driving Siqi Harness agents over JSON-RPC stdio |

## api

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-api-account-controller` | no | Expose safe account operations over authenticated Remote |
| `@liusiqi-dev/sqh-api-gateway` | yes | Typert Remote Host dispatcher and Client API endpoint |
| `@liusiqi-dev/sqh-api-job-controller` | yes | Job Remote observation stream and the reference-counted client job-output service |
| `@liusiqi-dev/sqh-api-remotes` | no | Remote BFF assembly for application-selected Host capabilities |
| `@liusiqi-dev/sqh-api-session-controller` | yes | Session Remote commands, cold reads, and live control transport |
| `@liusiqi-dev/sqh-api-settings-controller` | yes | Remote owner for the configuration surfaces over the settings-domain seams |
| `@liusiqi-dev/sqh-api-terminal-controller` | yes | Session-owned interactive terminals with shell discovery, screen recovery and typed Remote control |
| `@liusiqi-dev/sqh-api-workspace-controller` | yes | Workspace Remote commands and reconnect-safe state transport |
| `@liusiqi-dev/sqh-api-workspace-files` | yes | Workspace file service and Client resource provider: bounded reads, directory listing, and live metadata over the workspaceFiles Remote namespace |

## attachment

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-attachment-local` | yes | Private content-addressed SQODE_HOME attachment storage |

## boot

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-config-editor` | no | Persist plugin configuration through profile patches and Loader reconciliation |
| `@liusiqi-dev/sqh-hmr` | yes | Coordinated module and profile configuration hot reload |
| `@liusiqi-dev/sqh-plugin-manager` | yes | Current-profile plugin and bundle management shared by dsh CLI, Web and agent tools |

## browser-use

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-browser-use` | no | Exclusive named browser-use provider registration |

## bundle

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-acp-app` | no | The dsh ACP profile bundle: automation-only JSON-RPC stdio and process lifecycle over dsh-base |
| `@liusiqi-dev/sqh-headless` | yes | The dsh one-shot bundle: a direct core Agent/Session runner over dsh-base with no Host, HTTP, or browser layer |
| `@liusiqi-dev/sqh-sdk-app` | yes | The dsh SDK profile bundle: stdio JSON-RPC serving and process lifecycle over dsh-base |
| `@liusiqi-dev/sqh-web-app` | yes | The dsh browser-surface bundle: the web patch layer over dsh-base plus the runtime glue plugin (frontend dist serving, web-surface prompt, bash runtime variables, URL line) |

## client

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-client-connection` | yes | Authenticated RPC transport and generation lifecycle |
| `@liusiqi-dev/sqh-client-file-upload` | no | Agent-scoped browser file upload, streaming intake, and staged receipt service |
| `@liusiqi-dev/sqh-client-hmr` | yes | Web client graph synchronization and rebuilt-bundle reload transport |
| `@liusiqi-dev/sqh-client-locale` | no | Locale plugin: Host-backed preference, extensible language catalog, browser fallback, and typed built-in dictionaries |
| `@liusiqi-dev/sqh-client-modules` | no | Client module system, dual-face: node half composes the __SQH_BOOT__ entry graph (incremental dsh.client scan, bundle route, index tap, webPlugins service); browser half is the lazy-CJS module table the vendored cordis Loader consumes as its internal seam |
| `@liusiqi-dev/sqh-client-product-analytics` | yes | Desktop product event collection and authenticated Host reporting |
| `@liusiqi-dev/sqh-client-resources` | no | Unified client resource model: protocol-registered providers turn URL addresses into live values, consumed through the useResource global standard hook |
| `@liusiqi-dev/sqh-client-shortcuts` | yes | Application keyboard command registry and physical-key routing |
| `@liusiqi-dev/sqh-client-ui-agent-preset` | no | Agent-preset surfaces: the default for later sessions, this session's seat, and the composition editor |
| `@liusiqi-dev/sqh-client-ui-approval` | no | Approval composer takeover over the scoped Remote Event waterfall |
| `@liusiqi-dev/sqh-client-ui-attachment` | no | Dynamic attachment presentation plugin for conversation input, message-image, and trajectory image slots |
| `@liusiqi-dev/sqh-client-ui-brand-official` | no | Official Siqi Harness brand occupants for the Web client's sidebar slots |
| `@liusiqi-dev/sqh-client-ui-chat` | no | Chat Conversation target, node definitions, renderers, and details surface |
| `@liusiqi-dev/sqh-client-ui-commands` | no | Client command surface: global directory cache, '/' source, three command UI kinds, popupSelect registry |
| `@liusiqi-dev/sqh-client-ui-conversation` | no | Target-neutral Conversation assembly, shell, composer, queue, and view navigation |
| `@liusiqi-dev/sqh-client-ui-deliverables` | no | Changed-files card with per-file comparison tabs, delivery cards, and clickable final-response file references for Web |
| `@liusiqi-dev/sqh-client-ui-directory-picker-browse` | no | In-app directory browsing surface: the workspace directory-flow owner rendering the host's listing and creation primitives |
| `@liusiqi-dev/sqh-client-ui-directory-picker-native` | no | Native directory-picker surface: the renderless workspace directory-flow occupant driving the local Desktop or Host OS chooser |
| `@liusiqi-dev/sqh-client-ui-goal` | no | Session goal surface: GoalBar docked above the composer, read from the goal session projection |
| `@liusiqi-dev/sqh-client-ui-input-trigger` | no | Input trigger pipeline: '/' and '@' detection, candidate menu, pick routing to registered sources |
| `@liusiqi-dev/sqh-client-ui-jobs` | no | Session-header background-job list with on-demand streaming record panels |
| `@liusiqi-dev/sqh-client-ui-layout` | no | Shell plugin: three-column AppFrame with drag handles, ctx.layout viewing-state service (navigation + panels) |
| `@liusiqi-dev/sqh-client-ui-message-feedback` | no | The Web feedback surface: per-message Like/Dislike in the assistant-message action strip and the feedback dialog behind both ratings and /feedback, backed by the messageFeedback and sessionFeedback Host Remotes |
| `@liusiqi-dev/sqh-client-ui-model-selection` | no | Model selection over the shared model catalog, Session projection, and session.selectModel |
| `@liusiqi-dev/sqh-client-ui-open-in-app` | no | Web "Open In..." controls: the Session-header split button opening the workspace directory in an installed application, and the document preview's default-application controls for one file |
| `@liusiqi-dev/sqh-client-ui-permission-presets` | no | Permission surfaces: a new-session default in General settings and a current-session /permission popup over the permissions projection |
| `@liusiqi-dev/sqh-client-ui-plan` | no | Plan mode controls, persistent transcript plan cards, and sidebar Markdown previews |
| `@liusiqi-dev/sqh-client-ui-plugin-manager` | yes | Plugin management for the dsh web client: the sidebar Plugins panel installs, enables, disables, retries, and composes installed plugin packages |
| `@liusiqi-dev/sqh-client-ui-reference` | no | Unified Web @file and @session reference source |
| `@liusiqi-dev/sqh-client-ui-renderer` | no | Browser UI renderer: React slot bindings, ctx.uiRenderer, and the assembled application root |
| `@liusiqi-dev/sqh-client-ui-schedule` | no | Host task management page and Session reminder catalog |
| `@liusiqi-dev/sqh-client-ui-session` | no | Session Controller adapter for React and session-scoped slots |
| `@liusiqi-dev/sqh-client-ui-settings` | no | Settings domain base plugin: shared configuration forms and the canonical settings slot-type contract |
| `@liusiqi-dev/sqh-client-ui-settings-account` | yes | Manage DeepSeek login and open Platform billing pages |
| `@liusiqi-dev/sqh-client-ui-settings-agent-loop` | no | Settings page of the agent loop on the dsh web client's Plugins page: the parallel tool-call cap of the agent-loop namespace |
| `@liusiqi-dev/sqh-client-ui-settings-general` | no | Settings ownerless-copy and product onboarding plugin: the General section, shell trigger/header chrome content, settings dictionaries, and the versioned welcome notice |
| `@liusiqi-dev/sqh-client-ui-settings-models` | yes | Models settings and shared product-onboarding dialogs over existing settings and credential joins |
| `@liusiqi-dev/sqh-client-ui-settings-plugin-inventory` | no | Read-only Cordis Loader inventory tab in Web Plugins settings |
| `@liusiqi-dev/sqh-client-ui-settings-plugins` | no | Built-in plugins settings section for the dsh web client: the Settings navigation entry and the tab chrome feature-owned tabs register into |
| `@liusiqi-dev/sqh-client-ui-settings-session-log` | no | General settings control for Session-log upload with DeepSeek API requests |
| `@liusiqi-dev/sqh-client-ui-settings-shell` | no | Settings page of the shell executor on the dsh web client's Plugins page: the command timeout and the per-stream output cap of the shell namespace |
| `@liusiqi-dev/sqh-client-ui-settings-subagent` | no | Settings page of Subagent delegation on the dsh web client's Plugins page: recursion depth, parallel capacity, and the models agents may choose for subagents |
| `@liusiqi-dev/sqh-client-ui-settings-web-search` | no | Settings page of the built-in web-search provider on the web client's Plugins page: its endpoint, pacing, and per-request result budget |
| `@liusiqi-dev/sqh-client-ui-shortcuts` | no | Keyboard shortcut reference, recording, and local preference editing |
| `@liusiqi-dev/sqh-client-ui-sidebar` | no | Sidebar plugin: session multi-level tree, search, grouping, state dots |
| `@liusiqi-dev/sqh-client-ui-sidebar-browser` | no | Sandboxed Web browser tabs for the right Sidebar |
| `@liusiqi-dev/sqh-client-ui-sidebar-documentpreview` | yes | Extensible Sidebar previews for Office documents, spreadsheets, Markdown, code, images, PDF, HTML, and plain text |
| `@liusiqi-dev/sqh-client-ui-sidebar-files` | no | Workspace file tree tab type for the right Sidebar: lazy directory listing over the workspaceFiles Remote namespace, opening files into the Sidebar |
| `@liusiqi-dev/sqh-client-ui-sidebar-right` | no | Right Sidebar: the docking surface's session-bound state, its panel and header expand control, and the navigation service over it |
| `@liusiqi-dev/sqh-client-ui-sidebar-terminal` | no | Interactive shell tabs for the right Sidebar |
| `@liusiqi-dev/sqh-client-ui-skill` | no | Web skill references and the dedicated skill tool row |
| `@liusiqi-dev/sqh-client-ui-subagent` | no | Subagent conversation catalog, continuation routing UI, and '@' reference source |
| `@liusiqi-dev/sqh-client-ui-theme` | yes | Theme plugin: Host bootstrap for the pre-plugin palette; DOM-free ThemeRuntime for light/dark/system state; --dsw-* token styles and Appearance settings row |
| `@liusiqi-dev/sqh-client-ui-tool` | no | Client Tool call-tree renderer and keyed per-tool presentation slot |
| `@liusiqi-dev/sqh-client-ui-trajectory` | no | Trajectory event ledger with an interactive timing overview: pure-consumer plugin registering into the conversation ViewMap (no service) |
| `@liusiqi-dev/sqh-client-ui-user-questions` | no | Web ask_user_question composer takeover and plan-review presentation UI |
| `@liusiqi-dev/sqh-client-ui-workflow-run` | no | Durable workflow-run Conversation Node and nested member disclosure for dsh web |
| `@liusiqi-dev/sqh-client-ui-workspace` | no | Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots |

## compaction

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-command-compact` | no | Human-facing slash command for explicit session compaction |
| `@liusiqi-dev/sqh-compaction-basic` | yes | Token-meter-driven compaction policy and LLM summarization backend for the Siqi Harness |
| `@liusiqi-dev/sqh-compaction-image-offload` | no | Durable image offload for image-capable routes: replace over-budget request images with placeholders and retry |
| `@liusiqi-dev/sqh-compaction-tool-result-pruner` | yes | Replay-safe model-free head/middle/tail pruning for tool-result surface nodes |

## computer-use

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-computer-use` | no | Exclusive named computer-use provider registration |

## context

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-agent-instructions` | yes | Workspace context loader for AGENTS.md/CLAUDE.md instruction files |
| `@liusiqi-dev/sqh-file-reference-local` | yes | Local-filesystem ctx.fileReferences provider with bounded fuzzy indexes |
| `@liusiqi-dev/sqh-session-reference` | yes | Cross-session snapshot references and durable untrusted model context (ctx.sessionReferenceResolver) |
| `@liusiqi-dev/sqh-time-context` | yes | Durable per-step context with the current time and elapsed time |
| `@liusiqi-dev/sqh-tmux-context` | yes | Opt-in durable per-step context with this agent's tmux pane and window location |

## core

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-agent` | no | Agent interface, registry, initiator scope, and event vocabulary for the Siqi Harness |
| `@liusiqi-dev/sqh-agent-default-model` | yes | Default model selection shared by Agent entry points |
| `@liusiqi-dev/sqh-agent-loop` | yes | The concrete agent loop plugin for the Siqi Harness |
| `@liusiqi-dev/sqh-agent-tool-presentation` | yes | Agent-plane presentation selector: composes one agent's tools as PTC mode, native, or both |
| `@liusiqi-dev/sqh-session` | no | Event-sourced session store for the Siqi Harness |
| `@liusiqi-dev/sqh-system-prompt` | yes | System prompt assembly registry for the Siqi Harness |
| `@liusiqi-dev/sqh-tools` | yes | Tool registry and execution pipeline for the Siqi Harness |

## credentials

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-authorization` | no | Authorization seam (ctx.authorization): plugin-owned flows that obtain a credential through a conversation with the human |
| `@liusiqi-dev/sqh-credentials-local` | yes | File-backed credentials provider ($SQODE_HOME/.env under the live process environment) for the Siqi Harness |
| `@liusiqi-dev/sqh-deepseek-account-platform` | yes | Authorize DeepSeek accounts through browser PKCE |

## deliverables

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-tool-present` | yes | Explicit workspace file delivery declarations for the Siqi Harness |
| `@liusiqi-dev/sqh-workspace-changes` | yes | Per-turn workspace file changes recorded from git working-tree snapshots and whole-file captures, with per-file comparisons, for the Siqi Harness |

## document

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-office-to-pdf` | yes | Shared Office-to-PDF conversion with bounded queues and caching |

## experimental

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-experimental-agent-team` | yes | Implicit-root Agent Teams roster, durable peer mailbox, and shared task DAG |
| `@liusiqi-dev/sqh-experimental-api-speech-to-text` | yes | Authenticated experimental speech transcription for browser clients |
| `@liusiqi-dev/sqh-experimental-auto-review` | no | Per-tool LLM authorization review for the Siqi Harness Auto permission preset |
| `@liusiqi-dev/sqh-experimental-browser-use-chrome-devtools-mcp` | yes | Experimental per-Session Chromium browser tools through chrome-devtools-mcp |
| `@liusiqi-dev/sqh-experimental-browser-use-playwright-mcp` | yes | Experimental per-Session Chromium browser tools through @playwright/mcp |
| `@liusiqi-dev/sqh-experimental-browser-use-stagehand-native` | yes | Experimental Stagehand browser tools with separately configured native models |
| `@liusiqi-dev/sqh-experimental-client-ui-agent-team` | no | Web Agent Teams roster, task board, and teammate navigation |
| `@liusiqi-dev/sqh-experimental-client-ui-voice-input` | no | Record speech and insert editable text into the conversation draft |
| `@liusiqi-dev/sqh-experimental-computer-use-cua-driver-mcp` | yes | Experimental computer use through an installed Cua Driver MCP executable |
| `@liusiqi-dev/sqh-experimental-computer-use-cua-driver-native` | no | Experimental computer-use provider embedding the Cua Driver native npm SDK |
| `@liusiqi-dev/sqh-experimental-inspector` | yes | Experimental cross-realm CDP hub for Host debugging and Client Runtime inspection |
| `@liusiqi-dev/sqh-experimental-ptc-runtime-python` | yes | CPython subprocess implementation of the Siqi Harness PTC execution seam |
| `@liusiqi-dev/sqh-experimental-speech-to-text` | yes | Experimental speech recognition with independently selectable providers |
| `@liusiqi-dev/sqh-experimental-speech-to-text-sensevoice` | yes | Local SenseVoice ONNX transcription with a managed sherpa-onnx process |
| `@liusiqi-dev/sqh-experimental-tool-agent-team` | yes | Scoped model-facing Agent Teams tools over ctx.agentTeams |

## extensions

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-client-ui-cordis` | no | Cordis dynamic-plugin definition card: the keyed cordis_define tool row with its run/stop switch |
| `@liusiqi-dev/sqh-cordis-client-runner` | no | Browser half of dynamic dual-half plugin packages: event subscription, closure evaluation, guard facade, and loader entries |
| `@liusiqi-dev/sqh-cordis-host-runner` | yes | Dynamic package definition registry, host-half sandbox lifecycle, and invoke handler table for model-mounted dual-half packages |
| `@liusiqi-dev/sqh-tool-cordis` | no | Read-only runtime API inspection for Harness plugin development |

## feedback

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-command-feedback` | no | Log-only session feedback: the record event, the sessionFeedback Host Remote, and the human-facing slash command |
| `@liusiqi-dev/sqh-message-feedback` | yes | Canonical Session-log ratings and notes for finalized assistant messages |

## fs

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-fs-local` | yes | Local-filesystem implementation of the Siqi Harness filesystem seam (ctx.fs) |
| `@liusiqi-dev/sqh-fs-observation-policy` | no | File-context policy plugin for the Siqi Harness — observed-state, read-before-edit, and version-guarded write/edit added over the ctx.fs provider seam through the fs/* event gate (no service API) |
| `@liusiqi-dev/sqh-fs-sandbox` | yes | Sandbox-enforcing implementation of the Siqi Harness filesystem seam: fences write/edit by the per-call sandbox mode (read-only denies mutation, workspace-write contains it to the workspace + temp roots) while reads pass through |
| `@liusiqi-dev/sqh-tool-fs` | yes | Model-facing filesystem tools (read, write, edit) over the Siqi Harness filesystem seam (ctx.fs) |
| `@liusiqi-dev/sqh-tool-fs-search` | yes | Model-facing filesystem discovery tools (glob, grep) backed by the packaged ripgrep binary (@vscode/ripgrep) |
| `@liusiqi-dev/sqh-tool-str-replace-editor` | yes | Model-facing view, create, literal replace, and line insert tool over the Harness filesystem service |

## goal

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-command-goal` | no | Human-facing slash command for persisted same-session goals |
| `@liusiqi-dev/sqh-goal` | yes | Event-sourced same-session goal state and lifecycle service for the Siqi Harness |
| `@liusiqi-dev/sqh-goal-round-driver` | no | Race-fenced same-session goal-round driver |
| `@liusiqi-dev/sqh-tool-goal` | yes | Model-facing same-session goal tools with execution-time authority checks |

## guard

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-repeat-tool-reminder` | yes | Repeat-tool-call guard plugin: advisory reminders when an agent loops on identical tool calls |
| `@liusiqi-dev/sqh-tool-call-timeout-policy` | no | Tool-call timeout policy: a tools/execute wrapper that arms a per-tool deadline on exec.signal and returns TOOL_TIMEOUT when it wins |

## hooks

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-hooks-claude-code` | yes | Bridge plugin: run a Claude Code hooks.json / settings hook config on the Siqi Harness interception seams |
| `@liusiqi-dev/sqh-hooks-codex` | yes | Bridge plugin: run a Codex hooks.json hook config on the Siqi Harness interception seams |

## host

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-host-directory-picker-auto` | no | Adaptive chooser of the directory-picker seam: resolves the host situation at boot and mounts the native or browse backend for the Siqi Harness web GUI host |
| `@liusiqi-dev/sqh-host-directory-picker-browse` | yes | In-app browsing backend of the directory-picker seam (listing/creation primitives over the host filesystem) |
| `@liusiqi-dev/sqh-host-directory-picker-native` | no | Native-OS-chooser backend of the directory-picker seam for the Siqi Harness web GUI host |
| `@liusiqi-dev/sqh-host-frontend-static` | yes | SPA dist server for the Web shell: owns the webserver fallback seat, serving explicit index entries and static assets with traversal rejection and 404 misses |
| `@liusiqi-dev/sqh-host-open-in-app` | yes | Host half of open-in-app: resolved application catalog, icons, and the launch endpoint as three webServer routes |
| `@liusiqi-dev/sqh-host-plugin-inventory` | no | Read-only Remote projection of current Cordis Loader plugin state |
| `@liusiqi-dev/sqh-host-product-telemetry-otel` | yes | Explicit product usage events exported through OpenTelemetry HTTP logs |
| `@liusiqi-dev/sqh-host-webserver` | yes | Web route-registration plugin: HTTP and upgrade routes, index transform taps, and static dist fallback; knows no harness concepts |

## interaction

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-commands` | no | Plugin-owned human command registry for Siqi Harness UIs |
| `@liusiqi-dev/sqh-permission-presets` | yes | User-facing permission presets (ctx.permissionPresets) for the Siqi Harness: one product-level Permissions select bundling the sandbox-mode and approval-policy knobs, written through to their own session events |
| `@liusiqi-dev/sqh-tool-ask-user` | yes | Model-facing ask_user_question tool over the ctx.userQuestions seam |
| `@liusiqi-dev/sqh-user-approval` | yes | User-approval seam (ctx.approval) for the Siqi Harness: one-shot permission decisions dispatched to composed answerers over the approval/request waterfall, fail-closed by default |
| `@liusiqi-dev/sqh-user-questions` | no | Abstract user-questions seam (ctx.userQuestions) for asking the human during agent runs |

## jobs

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-jobs-local` | yes | Process-local implementation of the Siqi Harness background job registry seam |
| `@liusiqi-dev/sqh-tool-jobs` | yes | Model-facing background job control tools (job_output, job_list, job_kill) over the ctx.jobs registry |

## llm

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-deepseek-llm-api-extensions` | no | Additive request-field registry for the official DeepSeek LLM API adapter |
| `@liusiqi-dev/sqh-llm` | no | Provider-neutral LLM service interface for the Siqi Harness |
| `@liusiqi-dev/sqh-llm-deepseek-account` | yes | DeepSeek account provider authentication and discovery |
| `@liusiqi-dev/sqh-llm-deepseek-api-key` | yes | DeepSeek api-key provider authentication and discovery |
| `@liusiqi-dev/sqh-llm-pi-ai` | yes | pi-ai-backed DeepSeek adapter for the Siqi Harness LLM seam (design-verification twin of dsh-llm-deepseek) |
| `@liusiqi-dev/sqh-llm-retry` | yes | Provider-routed LLM request retry policy for the Siqi Harness |
| `@liusiqi-dev/sqh-plugin-package-inventory-deepseek` | yes | Active Loader-backed plugin package inventory for official DeepSeek LLM API requests |
| `@liusiqi-dev/sqh-token-meter` | yes | Replay-aware token measurement service (ctx.tokenMeter) for the Siqi Harness |

## lsp

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-lsp` | no | Abstract LSP capability seam (ctx.lsp) for the Siqi Harness — language-server provider registry keyed by branded id and extension mapping, order-independent per-query selection, normalized definition/references/implementation/hover requests and results, and the LspError taxonomy |
| `@liusiqi-dev/sqh-lsp-stdio` | yes | Generic stdio language-server provider for the Siqi Harness LSP capability seam (ctx.lsp) — spawns configured servers, translates JSON-RPC, and serves transient-open goToDefinition/findReferences/goToImplementation/hover queries in the host filesystem namespace |
| `@liusiqi-dev/sqh-tool-lsp` | yes | Model-facing lsp tool over the Siqi Harness LSP capability seam (ctx.lsp) — one read-only tool with goToDefinition/findReferences/goToImplementation/hover operations, one-based UTF-16 cursor coordinates, bounded location rendering, and hover normalization |

## mcp

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-mcp-client` | yes | MCP client bridge: connects to MCP servers and registers their tools on ctx.tools |
| `@liusiqi-dev/sqh-mcp-resources` | no | Scoped MCP resource discovery and reading through shared model tools |

## plan

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-plan-mode` | yes | Logged per-agent plan mode with deployment guidance, a direct slash command, and a user-reviewed exit |

## preset

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-agent-preset` | yes | Declare an Agent capability composition in Cordis YAML |
| `@liusiqi-dev/sqh-agent-preset-registry` | yes | Declarative Agent preset registry and profile-backed editing |
| `@liusiqi-dev/sqh-persona` | yes | Composition-authored deployment persona section for the Siqi Harness |

## ptc-runtime

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-ptc-runtime-node` | yes | Sandboxed Node process implementation of the Siqi Harness PTC execution capability |

## runtime-diagnostics

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-invariants` | yes | Registry service for package-owned Siqi Harness runtime invariants |

## sandbox

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-sandbox-local` | yes | Local process-sandbox backends for the Siqi Harness sandbox seam: bwrap, the npm-distributed landlock-run launcher, macOS Seatbelt, or the Windows ACL restricted-token runner — functionally probed, fail-closed |
| `@liusiqi-dev/sqh-sandbox-policy` | yes | Per-call sandbox policy resolver and current model context: deployment fallbacks plus each session's mode and workspace root, shared by every enforcing capability family |

## schedule

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-schedule` | yes | Host-wide durable reminders with shared management and original-Session delivery |

## sdk

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-sdk-jsonrpc-server` | yes | Stdio JSON-RPC server plugin for out-of-process Siqi Harness SDK clients |

## session

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-session-checkpoint-policy` | no | Semantic session durability checkpoints before model requests and tool side effects |
| `@liusiqi-dev/sqh-session-log-deepseek` | yes | Incremental lossless session-log request extension for the official DeepSeek LLM API |
| `@liusiqi-dev/sqh-session-persistence-jsonl` | yes | JSONL durable session persistence backend for the Siqi Harness |
| `@liusiqi-dev/sqh-session-projection` | no | Session-projection seam: the merge-extensible projection type table, the provider contract, and the ctx.sessionProjections registry serving whole current values of log-derived per-session state |
| `@liusiqi-dev/sqh-session-projection-cache` | yes | Persisted projection cache (ctx.sessionProjectionCache): durable per-session checkpoint records on the session_projcache storage domain (per-record layout), throttled write-behind, and the cached listing read |
| `@liusiqi-dev/sqh-session-stats` | no | Whole-log conversation counts and wall times projection (sessionStats) for the Siqi Harness |
| `@liusiqi-dev/sqh-session-telemetry-otel` | yes | Feedback-authorized Session logs over byte-bounded OpenTelemetry HTTP requests |
| `@liusiqi-dev/sqh-session-title` | yes | Log-backed session title service and provider registry for the Siqi Harness |
| `@liusiqi-dev/sqh-session-title-all-prompts-llm` | yes | All-user-messages LLM provider plugin for Siqi Harness session titles |
| `@liusiqi-dev/sqh-session-title-first-prompt-llm` | yes | First-message LLM provider plugin for Siqi Harness session titles |
| `@liusiqi-dev/sqh-session-turn-outline` | no | Whole-log turn outline projection (turnOutline) for the Siqi Harness |

## session-query

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-session-log-export` | yes | Web Session-log export command and shared download dialog |
| `@liusiqi-dev/sqh-session-query-sqlite` | yes | Concrete ctx.sessionQuery backend with SQLite FTS5 search |
| `@liusiqi-dev/sqh-tool-session-query` | yes | Workspace-authorized model-facing session history search, trace, and event read tools |

## settings

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-settings` | no | Abstract user-settings seam (ctx.settings) for the Siqi Harness |

## shell

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-bash-local` | yes | Local-subprocess implementation of the Siqi Harness bash executor seam |
| `@liusiqi-dev/sqh-bash-sandbox` | yes | Sandbox-consuming implementation of the Siqi Harness bash executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `@liusiqi-dev/sqh-pwsh-local` | yes | Local PowerShell implementation of the Siqi Harness bash executor seam |
| `@liusiqi-dev/sqh-pwsh-sandbox` | yes | Sandbox-consuming implementation of the Siqi Harness PowerShell executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `@liusiqi-dev/sqh-shell-env` | yes | Tool-independent managed SQH_* shell environment registry |
| `@liusiqi-dev/sqh-tool-bash` | yes | Model-facing bash tool with optional generic background-job and sandbox-escalation support |
| `@liusiqi-dev/sqh-tool-bash-persistent` | yes | Model-facing owner-scoped persistent Bash tool backed by the Harness PTY service |
| `@liusiqi-dev/sqh-tool-pwsh` | yes | Model-facing pwsh tool over the bash executor seam |
| `@liusiqi-dev/sqh-tool-pwsh-persistent` | yes | Model-facing owner-scoped persistent PowerShell tool backed by the Harness PTY service |

## skill

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-skill` | yes | Agent skill provider registry for the Siqi Harness |
| `@liusiqi-dev/sqh-skill-badge` | no | Bundled dsh badge skill provider for Siqi Harness |
| `@liusiqi-dev/sqh-skill-filesystem` | yes | Local filesystem skill provider for the Siqi Harness |
| `@liusiqi-dev/sqh-skill-office` | yes | Bundled Word, PowerPoint, and Excel workflows and structural checks |
| `@liusiqi-dev/sqh-tool-skill` | yes | Model-facing skill loading tool for the Siqi Harness |
| `@liusiqi-dev/sqh-tool-workspace-dependencies` | yes | The load_workspace_dependencies tool: absolute paths into a bundled Python, Node.js, and pnpm payload |

## spill

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-spill-local` | yes | Local-filesystem implementation of the Siqi Harness spill storage seam (private session-scoped files) |
| `@liusiqi-dev/sqh-spill-policy` | yes | Token-budgeted tool-result retention with recoverable text and image paths |

## ssh

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-fs-ssh` | no | Filesystem provider over the shared POSIX SSH helper |
| `@liusiqi-dev/sqh-sandbox-ssh` | no | Remote POSIX sandbox argv provider over the shared SSH helper |
| `@liusiqi-dev/sqh-ssh` | yes | Shared OpenSSH connection and versioned POSIX remote helper |
| `@liusiqi-dev/sqh-subprocess-ssh` | no | Subprocess and terminal provider over the shared POSIX SSH helper |

## storage

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-storage` | no | Storage hub (ctx.storage): named backend registry plus mounted data-form facilities for the Siqi Harness |
| `@liusiqi-dev/sqh-storage-domain` | yes | Domain data form (ctx.storage.domain): schema-validated, event-emitting KV domains over storage backends for the Siqi Harness |
| `@liusiqi-dev/sqh-storage-json` | yes | JSON file KV storage backend for the Siqi Harness storage hub |
| `@liusiqi-dev/sqh-storage-sqlite` | yes | SQLite storage backend (kv facet) for the Siqi Harness storage hub |

## subagent

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-subagent` | yes | Abstract subagent seam (ctx.subagents): named-provider registry for delegating to child agents |
| `@liusiqi-dev/sqh-subagent-acp` | yes | Out-of-process ACP subagent backend: drives a child agent in a spawned subprocess over the Agent Client Protocol |
| `@liusiqi-dev/sqh-subagent-claude-code` | yes | One-shot Claude Code subagent provider over the official Agent SDK |
| `@liusiqi-dev/sqh-subagent-codex` | yes | One-shot Codex subagent provider over the official app-server protocol |
| `@liusiqi-dev/sqh-subagent-fork-in-process` | yes | In-process fork subagent backend: runs a child agent seeded with a prefix of the parent's log |
| `@liusiqi-dev/sqh-subagent-sdk` | yes | Out-of-process SDK subagent backend: drives a child Siqi Harness runtime subprocess over stdio JSON-RPC through the TypeScript SDK client |
| `@liusiqi-dev/sqh-subagent-spawn-in-process` | yes | In-process spawn subagent backend: runs a fresh child agent on ctx.agents |
| `@liusiqi-dev/sqh-tool-subagent` | yes | Model-facing subagent delegation tool over the ctx.subagents seam |
| `@liusiqi-dev/sqh-tool-subagent-control` | no | Globally named send_message, interrupt_agent, and list_agents tools over ctx.subagents continuations |

## subprocess

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-subprocess-local` | no | Local-subprocess implementation of the Siqi Harness subprocess seam |

## telemetry

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-otel` | no | Cordis service for independent ordinary-event and byte-bounded Session-log OTLP channels |

## terminal

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-terminal` | no | Persistent PTY session seam for the Siqi Harness — owner-scoped ids, backend registry, interactive sends, reads, signals, and awaited cleanup |
| `@liusiqi-dev/sqh-terminal-bash` | yes | Persistent shell PTY backend over the Siqi Harness subprocess terminal primitive |
| `@liusiqi-dev/sqh-tool-terminal` | yes | Six model-facing persistent PTY tools with owner isolation and generic background-job integration |

## test-support

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-llm-replay` | yes | Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests) |

## todo

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-tool-todo` | yes | Model-facing todo_write tool over the Siqi Harness event-sourced session log |

## typert

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-typert-loader` | yes | Loader integration for generated Typert package contributions |

## web

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-tool-web` | yes | Model-facing web tools (web_search, web_fetch) over the Siqi Harness web capability seam (ctx.web) |
| `@liusiqi-dev/sqh-web` | yes | Abstract web access capability seam (ctx.web) for the Siqi Harness — search/fetch provider registry, registration-order-independent selection, request/result vocabulary, and the WebError taxonomy |
| `@liusiqi-dev/sqh-web-fetch-http` | yes | Anonymous public HTTP(S) fetch provider for the Siqi Harness web capability seam (ctx.web) |
| `@liusiqi-dev/sqh-web-search-deepseek` | yes | Search provider backed by an Anthropic-compatible Messages API with native web_search, for the Siqi Harness web capability seam (ctx.web) |
| `@liusiqi-dev/sqh-web-search-exa` | yes | Exa-backed search provider for the Siqi Harness web capability seam (ctx.web) |
| `@liusiqi-dev/sqh-web-search-http` | yes | Search-engine provider (Google Custom Search, falling back to Bing) for the web capability seam (ctx.web) |
| `@liusiqi-dev/sqh-web-search-perplexity` | yes | Perplexity-backed search provider for the Siqi Harness web capability seam (ctx.web) |
| `@liusiqi-dev/sqh-web-search-serp` | yes | Keyless search provider that reads a public search result page (Bing) for the web capability seam (ctx.web) |

## webhook

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-webhook` | no | Fire-and-forget webhook rule runtime that creates Workspace-backed Siqi Harness Sessions |
| `@liusiqi-dev/sqh-webhook-github` | yes | Signed GitHub HTTP webhook adapter for the Siqi Harness webhook runtime |

## workflow

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-tool-ralph` | yes | Model-facing fresh-agent Ralph loop over the workflow and subagent seams |
| `@liusiqi-dev/sqh-tool-workflow` | yes | Model-facing workflow tool: run a JavaScript orchestration script over ctx.workflowEngine |
| `@liusiqi-dev/sqh-workflow-ptc` | yes | Workflow orchestration in the shared sandboxed Node PTC runtime |

## workspace

| Package | Config | Description |
|---|---|---|
| `@liusiqi-dev/sqh-workspace` | no | Workspace entity registry (ctx.workspaceRegistry): durable workspace records with validated session attachment over the domain data form for the Siqi Harness |
