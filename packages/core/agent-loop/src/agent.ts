/**
 * Default Agent driver over queued turns and step-boundary input. Every request
 * is derived from the session log.
 * @module dsh-agent-loop/agent
 */

import type {
  Agent,
  AgentCancelCause,
  AgentEventDispatch,
  AgentOptions,
  AgentStatus,
  CancelOptions,
  InboxTarget,
  PreStepDecision,
  RequestErrorAction,
} from '@liusiqi-dev/sqh-agent'
import { agentEvents, assembleContextFor } from '@liusiqi-dev/sqh-agent'
import { declarationBudgetChars } from '@liusiqi-dev/sqh-tools'
import type { GenerateOptions, LlmCallConfig, Message, PreparedLlmCall } from '@liusiqi-dev/sqh-llm'
import {
  LlmError,
  createAssistantMessage,
  createDeveloperMessage,
  errorChain,
  markAgentLoopRequest,
} from '@liusiqi-dev/sqh-llm'
import { assertNever, deepFreeze } from '@liusiqi-dev/sqh-util-values'
import type { Scope } from '@liusiqi-dev/sqh-scope'
import { createScope } from '@liusiqi-dev/sqh-scope'
import type { EpochHeader, RequestContext, Session, SessionId, SessionSeq, TurnEndReason, UserMessage } from '@liusiqi-dev/sqh-session'
import { canonicalHeader, headerEquals, ToolCallRecovery } from '@liusiqi-dev/sqh-session'
import { joinContextSections, renderContextSections, renderPrompt } from '@liusiqi-dev/sqh-system-prompt'
import type { PromptAssembly } from '@liusiqi-dev/sqh-system-prompt'
import type {} from '@liusiqi-dev/sqh-session-projection'
import type { Context } from '@liusiqi-dev/cordis'
import { ReactLoopInbox } from './inbox.ts'
import { RuntimeContextProjection } from './runtime-context.ts'
import { AssistantStreamAttempt } from './assistant-stream.ts'
import { SystemPromptProjection } from './runtime-context.ts'
import { executeToolCalls } from './tool-calls.ts'

type Phase =
  | { kind: 'idle'; lastTurn: number }
  | {
    kind: 'maintenance'
    abort: AbortController
    lastTurn: number
    wakeRequested: boolean
  }
  | { kind: 'running'; abort: AbortController; turn: number; step: number; wakeRequested: boolean }

type StepEndReason = Extract<TurnEndReason, { kind: 'completed' | 'max-tokens' }>

type PreparedStep =
  | { kind: 'reject' }
  | {
    kind: 'enter'
    messages: UserMessage[]
    startsRequestSeries?: true
    assembly: PromptAssembly
  }

/** Remove adapter-derived values before plugins propose the next request config. */
function requestProposal(header: EpochHeader): LlmCallConfig {
  if (header.adapterDefaults === undefined) return header.config
  const proposal = { ...header.config }
  if (header.adapterDefaults.reasoningEffort === true) delete proposal.reasoningEffort
  if (header.adapterDefaults.maxTokens === true) delete proposal.maxTokens
  return proposal
}

/**
 * Read the cause `cancel()` passed when aborting a loop-owned signal, copying
 * only the fields `turn/end` records. The live reason stays the caller's
 * object, and Node's fetch assigns a `stack` onto it that `Session.append`
 * would either log or reject as data JSON cannot hold.
 * @param signal - a turn or maintenance signal this loop owns.
 * @returns the copied cause, or undefined while the signal is still live.
 */
function abortedCancelCause(signal: AbortSignal): AgentCancelCause | undefined {
  if (!signal.aborted) return undefined
  // `cancel()` is the only aborter of the signals this loop owns.
  const cause = signal.reason as AgentCancelCause
  switch (cause.kind) {
    case 'user':
    case 'parent':
    case 'disposed':
      return { kind: cause.kind }
    case 'hook':
      return { kind: 'hook', reason: cause.reason }
    /* v8 ignore next -- cancel accepts the closed AgentCancelCause union */
    default:
      return assertNever(cause)
  }
}

/** Drives one session through turn and step boundaries. */
export class ReactLoopAgent implements Agent {
  readonly inbox: ReactLoopInbox
  private phase: Phase
  private activityDone: Promise<void> = Promise.resolve()

  /** The agent-scoped registration boundary; the lifecycle owner unwinds it after the driver exits. */
  readonly scope: Scope
  readonly ctx: Context

  /** Fused dispatcher, built once in the constructor so hot-path dispatches never allocate. */
  private readonly dispatch: AgentEventDispatch

  /** Whether this loop instance has appended its initial/resume request anchor. */
  private requestHeaderLogged = false
  /** Surface generation at attachment or the preceding built request. */
  private requestSurfaceGeneration: number
  private readonly runtimeContext: RuntimeContextProjection
  /** Process-local revision of assistant frames for this attached Session. */
  private assistantStreamRevision = 0
  private assistantAttemptCounter = 0
  private readonly systemPrompt: SystemPromptProjection
  /** Identities fully frozen by this loop; weak references do not retain replaced history. */
  private readonly frozenMessages = new WeakSet<Message>()

  constructor(
    private loopCtx: Context,
    public readonly id: SessionId,
    public readonly options: AgentOptions,
    public readonly session: Session,
  ) {
    this.requestSurfaceGeneration = session.surface.contentGeneration
    this.dispatch = agentEvents(loopCtx, this)
    this.scope = createScope(loopCtx, this)
    this.ctx = this.scope.ctx
    this.inbox = new ReactLoopInbox(this.ctx.sessionProjections, session, this.dispatch)
    /* v8 ignore next -- the loop registers its own turnBoundary unit, so the key is always present */
    const lastTurn = this.loopCtx.sessionProjections.stateOf(session, 'turnBoundary')?.lastTurn ?? 0
    this.phase = { kind: 'idle', lastTurn }
    this.runtimeContext = new RuntimeContextProjection(this.ctx, session)
    this.systemPrompt = new SystemPromptProjection(session)
  }

  get status(): AgentStatus {
    return this.phase.kind === 'idle' || this.phase.kind === 'maintenance' ? 'idle' : 'running'
  }

  /** Commit a phase and publish its externally visible status transition. */
  private setPhase(next: Phase): void {
    const previousStatus = this.status
    this.phase = next
    const status = this.status
    if (status !== previousStatus) {
      this.dispatch.emit('agent/status', { status })
    }
  }

  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void {
    // Waking input cannot join an aborted activity, so it starts the next turn.
    // Captured before the insertion so a reentrant cancel from a splice observer cannot reclassify it.
    const wakingAfterAbort = wakeup && this.phase.kind !== 'idle' && this.phase.abort.signal.aborted
    const resolvedTarget = wakingAfterAbort ? 'next-turn' : target
    this.inbox.splice(resolvedTarget, Infinity, 0, [message])
    if (wakeup) this.wakeDriver(wakingAfterAbort)
  }

  followup(input: UserMessage): void {
    this.send(input, 'next-turn', true)
  }

  steer(input: UserMessage): void {
    this.send(input, 'next-step', true)
  }

  inject(input: UserMessage): void {
    this.send(input, 'next-step', false)
  }

  cancel(cause: AgentCancelCause, options: CancelOptions = {}): void {
    if (!options.keepInbox) {
      this.inbox.clear()
      if (this.phase.kind !== 'idle') this.phase.wakeRequested = false
    }
    if (this.phase.kind !== 'idle') this.phase.abort.abort(cause)
  }

  runMaintenance<T>(job: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.phase.kind !== 'idle') throw new Error(`agent "${this.id}" already has active work`)
    const done = Promise.withResolvers<void>()
    const maintenance: Phase = {
      kind: 'maintenance',
      abort: new AbortController(),
      lastTurn: this.phase.lastTurn,
      wakeRequested: false,
    }
    this.setPhase(maintenance)
    this.activityDone = done.promise
    return (async () => {
      try {
        return await job(maintenance.abort.signal)
      } finally {
        this.setPhase({ kind: 'idle', lastTurn: maintenance.lastTurn })
        const cause = abortedCancelCause(maintenance.abort.signal)
        if (cause?.kind !== 'disposed' && maintenance.wakeRequested && this.inbox.hasPending) this.wakeDriver()
        done.resolve()
      }
    })()
  }

  /**
   * Start one driver, or latch its wake behind maintenance or an aborted
   * activity. A wake sent while idle always opens its turn boundary, even
   * when its message was cleared; only a latched replay is suppressed when
   * the queue no longer holds the wake.
   * @param wakeAfterAbort - the {@link send} classification, captured before
   *   the inbox insertion so a reentrant cancel cannot reclassify it.
   */
  private wakeDriver(wakeAfterAbort = false): void {
    if (this.phase.kind !== 'idle') {
      // Maintenance and aborted drivers cannot deliver the wake: latch it for
      // replay at convergence. Live drivers claim queued work themselves;
      // disposal never latches, so teardown waits on no model turn.
      const reason = abortedCancelCause(this.phase.abort.signal)
      if (reason?.kind !== 'disposed' && (this.phase.kind === 'maintenance' || wakeAfterAbort)) {
        this.phase.wakeRequested = true
      }
      return
    }
    const driver = Promise.withResolvers<void>()
    this.activityDone = driver.promise
    this.setPhase({
      kind: 'running',
      abort: new AbortController(),
      turn: this.phase.lastTurn,
      step: 0,
      wakeRequested: false,
    })
    this.loopCtx.agents.withInitiator(this, () => this.kick()).then(driver.resolve, driver.reject)
  }

  async whenIdle(): Promise<void> {
    let activity: Promise<void>
    do {
      await (activity = this.activityDone)
    } while (activity !== this.activityDone)
  }

  /** Report one failure at its live boundary, then preserve it for driver containment. */
  private throwError(error: unknown): never {
    const turn = this.phase.kind === 'running' ? this.phase.turn : this.phase.lastTurn
    const step = this.phase.kind === 'running' ? this.phase.step : 0
    this.dispatch.emit('agent/error', { turn, step, error })
    throw error
  }

  private async kick(): Promise<void> {
    try {
      while (await this.turn()) {}
    } catch (_error) {
      // Reported failures and cancellation are contained at the driver boundary.
    } finally {
      /* v8 ignore next -- kick owns a running phase until this driver boundary */
      if (this.phase.kind === 'running') {
        const { turn, wakeRequested } = this.phase
        this.setPhase({ kind: 'idle', lastTurn: turn })
        if (wakeRequested && this.inbox.hasPending) this.wakeDriver()
      }
    }
  }

  private async preStep(target: InboxTarget, position: { turn: number; step: number }): Promise<PreparedStep> {
    /* v8 ignore next -- private callers establish the running phase before proposing a step */
    if (this.phase.kind !== 'running') throw new Error(`agent "${this.id}": pre-step outside running phase`)
    const signal = this.phase.abort.signal
    const claimed = this.inbox.claim(target, position.turn)
    const assembly = await this.loopCtx.systemPrompt.assemble(assembleContextFor(this, signal))
    signal.throwIfAborted()
    const sections = renderContextSections(assembly)
    const context = this.runtimeContext.project(joinContextSections(sections), sections)
    const decision = await this.dispatch.waterfall(
      'agent/pre-step', { messages: claimed, ...position, signal },
      (): Promise<PreStepDecision> => Promise.resolve<PreStepDecision>({
        kind: 'enter',
        messages: context === undefined ? claimed : [...claimed, context],
      }),
    )
    signal.throwIfAborted()
    if (decision.kind === 'reject') return decision
    return { ...decision, assembly }
  }

  /** Whether the assembled tool schemas differ from the logged request header's. */
  private toolsChanged(tools: PromptAssembly['tools']): boolean {
    const baseline = this.session.requestHeader()
    if (baseline === undefined) return false
    return !headerEquals(baseline, canonicalHeader({ ...baseline, tools: [...tools] }))
  }

  /** Open one turn before claiming its first proposed step. */
  private async turn(): Promise<boolean> {
    if (this.phase.kind !== 'running') {
      this.throwError(new Error(`agent "${this.id}": turn without driver reservation`))
    }
    const phase = this.phase
    const { signal } = phase.abort
    signal.throwIfAborted()
    const turn = phase.turn + 1
    try {
      this.session.append('turn/start', { turn })
    } catch (error: unknown) {
      this.throwError(error)
    }
    phase.turn = turn
    let turnEnds: TurnEndReason | null = null
    let target: InboxTarget = 'next-turn'
    try {
      while (true) {
        signal.throwIfAborted()
        const step = phase.step + 1
        const decision = await this.preStep(target, { turn, step })
        if (decision.kind === 'reject') {
          turnEnds = { kind: 'blocked' }
          return false
        }
        if (turnEnds && decision.messages.length === 0) break
        // A removed waking message or an enter decision rewritten to empty
        // still owns the initial turn boundary, but it spends no model call.
        if (phase.step === 0 && decision.messages.length === 0) {
          turnEnds = { kind: 'completed' }
          return false
        }
        signal.throwIfAborted()
        this.session.append('step/start', { turn, step })
        phase.step = step
        const toolRecovery = new ToolCallRecovery()
        const stopRecovery = this.ctx.on('session/event', (session, event) => {
          if (session === this.session) toolRecovery.observe(event)
        })
        try {
          // max-tokens is sticky: once any step hits the ceiling, later steps
          // that complete normally must not downgrade the turn outcome.
          const stepEnd = await this.step(decision)
          // max-tokens stays sticky: a later completed step must not
          // downgrade the turn outcome.
          if (turnEnds === null || turnEnds.kind !== 'max-tokens') turnEnds = stepEnd
        } catch (error: unknown) {
          try {
            for (const event of toolRecovery.results()) {
              this.session.append('tool/result', event.data, {
                surfaceOp: 'append',
                ...event.sourceEventSeqs === undefined ? {} : { sourceEventSeqs: event.sourceEventSeqs },
              })
            }
          } catch (recoveryError: unknown) {
            throw new AggregateError([error, recoveryError], 'Step failed and its pending tool results could not be recorded', { cause: error })
          }
          throw error
        } finally {
          stopRecovery()
          this.session.append('step/end', { turn, step })
        }
        signal.throwIfAborted()
        if (turnEnds && this.inbox.nextStep.length === 0) {
          await this.dispatch.serial('agent/turn-stopping', { turn, signal })
          signal.throwIfAborted()
        }
        if (turnEnds && this.inbox.nextStep.length === 0) break
        target = 'next-step'
      }
    } catch (error: unknown) {
      // A cause is present exactly while the signal is aborted.
      const cause = abortedCancelCause(signal)
      if (cause !== undefined) {
        turnEnds = { kind: 'aborted', reason: cause }
        throw error
      }
      // Every failure is structured: an `LlmError` keeps its facts, anything
      // else flattens to `errorChain` text under the `UNKNOWN` code.
      turnEnds = {
        kind: 'error',
        error: error instanceof LlmError
          ? error.failure
          : { message: errorChain(error), code: 'UNKNOWN' },
      }
      this.throwError(error)
    } finally {
      try {
        // oxlint-disable-next-line typescript/no-non-null-assertion -- every exit assigns a turn ending
        this.session.append('turn/end', { turn, reason: turnEnds! })
      } catch (error: unknown) {
        this.throwError(error)
      }
    }
    if (!this.inbox.hasPending) return false
    phase.abort = new AbortController()
    // A fresh controller makes a latch set on the old one stale: the live driver claims the queue itself.
    phase.wakeRequested = false
    phase.step = 0
    return true
  }

  private async step(decision: Extract<PreparedStep, { kind: 'enter' }>): Promise<StepEndReason | null> {
    /* v8 ignore next -- private callers establish the running phase before executing a step */
    if (this.phase.kind !== 'running') throw new Error(`agent "${this.id}": step outside running phase`)
    const { turn, step, abort: { signal } } = this.phase
    signal.throwIfAborted()

    const { assembly } = decision
    const renderedPrompt = renderPrompt(assembly)
    let firstAttempt = true
    while (true) {
      const { config, preparedCall } = await this.prepareRequest(turn, step, signal)
      const startsRequestSeries = firstAttempt && decision.startsRequestSeries === true
      const commits = this.systemPrompt.project(renderedPrompt, {
        inHistory: preparedCall?.systemPromptUpdate === 'in-history',
        startsSeries: startsRequestSeries
          || this.requestSurfaceGeneration !== this.session.surface.contentGeneration
          || (preparedCall?.toolUpdate === undefined && this.toolsChanged(assembly.tools)),
      })
      for (const { message, intent } of commits) {
        this.session.append('system/message', { turn, step, message }, intent)
      }
      if (firstAttempt) {
        for (const message of decision.messages) {
          this.session.append('user/message', message, { surfaceOp: 'append' })
        }
      }
      firstAttempt = false
      const request = this.buildRequest(config, preparedCall, assembly.tools, { turn, step }, startsRequestSeries, signal)
      const live = new AssistantStreamAttempt(
        this.session.id,
        ++this.assistantAttemptCounter,
        () => ++this.assistantStreamRevision,
        turn,
        step,
        (frame) => { this.dispatch.emit('agent/assistant-stream', { frame }) },
      )
      let started = false
      try {
        const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)
        signal.throwIfAborted()
        live.start()
        started = true
        for await (const chunk of stream) {
          signal.throwIfAborted()
          live.push(chunk)
        }
        signal.throwIfAborted()
      } catch (error: unknown) {
        if (!started) throw error
        try {
          if (signal.aborted) {
            const content = live.interruptedBlocks()
            if (content.length > 0) {
              live.settle('assistant/message', () => this.session.append('assistant/message', {
                turn,
                step,
                message: createAssistantMessage({
                  content,
                  source: {
                    provider: request.provider,
                    model: request.model,
                    ...live.replayState === undefined ? {} : { replayState: live.replayState },
                  },
                }),
                interrupted: true,
                ...live.usage === undefined ? {} : { usage: live.usage },
                stream: live.stream,
              }, { surfaceOp: 'append' }).seq)
            } else {
              live.settle(
                'assistant/attempt',
                () => this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq,
              )
            }
          } else {
            live.settle(
              'assistant/attempt',
              () => this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq,
            )
          }
        } catch (settlementError: unknown) {
          throw new AggregateError(
            [error, settlementError],
            'Assistant stream failed and its durable settlement was rejected',
            { cause: error },
          )
        }
        throw error
      }
      try {
        const finish = live.finish
        if (finish.kind === 'error' || finish.kind === 'aborted') {
          live.settle(
            'assistant/attempt',
            () => this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq,
          )
          const action = await this.dispatch.waterfall(
            'agent/request-error', {
              turn,
              step,
              provider: request.provider,
              failure: finish.failure,
              retryPolicy: preparedCall?.retryPolicy,
              signal,
            },
            () => Promise.resolve<RequestErrorAction>(undefined),
          )
          signal.throwIfAborted()
          if (action?.kind !== 'retry') {
            throw new LlmError(finish.failure.message, finish.failure.code, finish.failure)
          }
          continue
        }

        const message = createAssistantMessage({
          content: live.blocks(),
          source: {
            provider: request.provider,
            model: request.model,
            ...live.replayState !== undefined ? { replayState: live.replayState } : {},
          },
        })
        live.settle(
          'assistant/message',
          () => this.session.append('assistant/message', {
            turn,
            step,
            message,
            ...live.usage === undefined ? {} : { usage: live.usage },
            stream: live.stream,
          }, { surfaceOp: 'append' }).seq,
        )
        if (finish.kind === 'max-tokens') return { kind: 'max-tokens' }

        const toolCalls = message.content.filter(block => block.type === 'tool-call')
        if (toolCalls.length === 0) return { kind: 'completed' }
        const { concluded } = await executeToolCalls(
          this.loopCtx, turn, step, toolCalls, signal,
          context => this.inbox.splice('next-step', this.inbox.nextStep.length, 0, [context]),
        )
        return concluded ? { kind: 'completed' } : null
      } catch (error: unknown) {
        if (!live.ended) live.abandon()
        throw error
      }
    }
  }

  /** Resolve request config and bind its adapter before admitting model-visible input. */
  private async prepareRequest(
    turn: number,
    step: number,
    signal: AbortSignal,
  ): Promise<{ config: LlmCallConfig; preparedCall?: PreparedLlmCall }> {
    const { session } = this

    // A loop instance starts from its declared route, restoring only an explicit
    // effort owned by that exact model. Later steps re-resolve marked defaults.
    const persistedHeader = session.requestHeader()
    const persistedConfig = persistedHeader?.config
    const route = { provider: this.options.provider ?? '', model: this.options.model ?? '' }
    const persistedReasoningEffort = persistedConfig?.provider === route.provider
      && persistedConfig.model === route.model
      && persistedHeader?.adapterDefaults?.reasoningEffort !== true
      ? persistedConfig.reasoningEffort
      : undefined
    const reasoningEffort = this.options.reasoningEffort ?? persistedReasoningEffort
    const maxTokens = this.options.maxTokens
    const seedConfig = deepFreeze(structuredClone(
      this.requestHeaderLogged
        // oxlint-disable-next-line typescript/no-non-null-assertion -- the instance logged the header it now folds
        ? requestProposal(persistedHeader!)
        : {
          ...route,
          ...reasoningEffort === undefined ? {} : { reasoningEffort },
          ...maxTokens === undefined ? {} : { maxTokens },
        },
    ))
    const proposedConfig = await this.dispatch.waterfall(
      'agent/request', { turn, step, signal },
      () => Promise.resolve(seedConfig),
    )
    signal.throwIfAborted()
    if (!proposedConfig.provider || !proposedConfig.model) {
      throw new Error(`agent "${this.id}" has no provider/model: set AgentOptions.provider and AgentOptions.model or supply both via the agent/request waterfall`)
    }
    let config: LlmCallConfig
    let preparedCall: PreparedLlmCall | undefined
    try {
      preparedCall = await this.loopCtx.llm.prepareCall(proposedConfig, signal)
      config = preparedCall.config
    } catch (error: unknown) {
      // Middleware may serve an unregistered route; terminal dispatch still requires an adapter.
      if (!(error instanceof LlmError) || error.code !== 'NO_ADAPTER') throw error
      config = proposedConfig
    }
    signal.throwIfAborted()
    return { config, ...preparedCall === undefined ? {} : { preparedCall } }
  }

  /** Log the resolved envelope and derive a frozen request from the admitted surface. */
  private buildRequest(
    config: LlmCallConfig,
    preparedCall: PreparedLlmCall | undefined,
    tools: GenerateOptions['tools'] & object,
    position: { turn: number; step: number },
    startsRequestSeries: boolean,
    signal: AbortSignal,
  ): GenerateOptions {
    const { session } = this
    // The catalog is trimmed before the header is built, not after the adapter
    // sees it: a route without tool-update support strips `deferLoading` and sends
    // everything verbatim, so the only place a cut survives every route is here.
    const contextWindow = preparedCall?.context?.contextWindow
    // Undefined for a session folded before this projection existed; an empty list
    // then declares the core set alone, which is the safe direction.
    const loaded = this.ctx.sessionProjections.stateOf(session, 'toolsLoaded') ?? []
    const declared = declareWithin(loaded, contextWindow, tools)
    const surfaceGeneration = session.surface.contentGeneration
    const header = canonicalHeader({
      config,
      ...preparedCall === undefined ? {} : { adapterDefaults: preparedCall.adapterDefaults },
      ...declared.length > 0 ? { tools: declared } : {},
    })
    const baseline = this.session.requestHeader()
    const startsSeries = startsRequestSeries
      || this.requestSurfaceGeneration !== surfaceGeneration
    let headerSeq: SessionSeq | undefined
    if (!this.requestHeaderLogged) {
      // Compaction during the first resumed pre-step must still mark a new series.
      headerSeq = this.session.append('request/header', {
        header,
        reason: baseline === undefined ? 'initial' : 'resume',
        ...startsSeries ? { startsSeries: true } : {},
      }).seq
      this.requestHeaderLogged = true
    } else if (baseline === undefined || !headerEquals(baseline, header)) {
      headerSeq = this.session.append('request/header', {
        header,
        reason: 'change',
        ...startsSeries ? { startsSeries: true } : {},
      }).seq
    } else if (startsSeries) {
      this.session.append('request/header', { header, reason: 'series' })
    }
    if (baseline !== undefined && headerSeq !== undefined) {
      const previousNames = new Set(baseline.tools?.map(tool => tool.name))
      const currentNames = new Set(declared.map(tool => tool.name))
      const additions = declared.filter(tool => !previousNames.has(tool.name))
        .map(tool => ({ type: 'tool-addition' as const, toolName: tool.name }))
      const removals = (baseline.tools ?? []).filter(tool => !currentNames.has(tool.name))
        .map(tool => ({ type: 'tool-removal' as const, toolName: tool.name }))
      if (additions.length > 0 || removals.length > 0) {
        session.append('developer/message', {
          ...position,
          message: createDeveloperMessage({ source: { kind: 'tool-registry' }, content: [...additions, ...removals] }),
          ...additions.length > 0 ? { headerSeq } : {},
        }, { surfaceOp: 'append' })
      }
    }
    this.requestSurfaceGeneration = surfaceGeneration

    const systemPromptUpdate = preparedCall?.systemPromptUpdate
    const requestContext: RequestContext = {
      provider: config.provider,
      model: config.model,
      ...contextWindow === undefined ? {} : { contextWindow },
      ...systemPromptUpdate === undefined ? {} : { systemPromptUpdate },
    }
    const previousContext = session.requestContext()
    if (previousContext?.provider !== requestContext.provider
      || previousContext.model !== requestContext.model
      || previousContext.contextWindow !== requestContext.contextWindow
      || previousContext.systemPromptUpdate !== requestContext.systemPromptUpdate) {
      session.append('request/context', requestContext)
    }
    signal.throwIfAborted()

    // canonicalHeader is shallow; append logs a detached snapshot, not these local values.
    deepFreeze(header)
    const boundaryMessages = session.deriveMessages()
    for (const message of boundaryMessages) {
      if (this.frozenMessages.has(message)) continue
      deepFreeze(message)
      this.frozenMessages.add(message)
    }
    Object.freeze(boundaryMessages)
    const request = markAgentLoopRequest(Object.freeze({
      ...header.config,
      messages: boundaryMessages,
      toolHistory: session.toolHistory(),
      ...header.tools !== undefined ? { tools: header.tools } : {},
      sessionId: this.session.id,
      signal,
    }))
    return request
  }
}

/**
 * Windows below this cannot carry a full tool catalog alongside a conversation.
 *
 * 200,000 sits between the two routes in use: a 100K model cannot hold the measured
 * catalog at all, while a 1M model carries it comfortably.
 */
const NARROW_WINDOW_TOKENS = 200_000

/**
 * Tools every request declares, whatever else it leaves out.
 *
 * A catalog measured 240 tools and 821,567 characters — 205K tokens with every
 * request, which alone exceeds a 100K window. These cost about 9,235 characters.
 *
 * `list_tools` and `tool_search` belong here or the trimming has no way out: if the
 * only means of finding a tool were itself omitted, a narrow route could never
 * declare anything beyond this list.
 */
const DECLARED_CORE: ReadonlySet<string> = new Set([
  // Reading and acting on the workspace.
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'pwsh',
  // Background work: listing and reading jobs without a way to stop one is a
  // capability that cannot be finished, so `job_kill` belongs beside them.
  'job_list',
  'job_output',
  'job_kill',
  // The escape hatches. `list_tools` and `tool_search` are how everything outside
  // this set is reached; `skill` is how a skill's instructions are loaded. Omitting
  // any of them makes the trimming irreversible.
  'list_tools',
  'tool_search',
  'skill',
  // Research: the two tools a sourcing task cannot start without, and the cheapest
  // in the catalog (565 characters together).
  'web_search',
  'web_fetch',
  'ask_user_question',
])

/**
 * Keep only the tools this route can afford to declare.
 *
 * A route that reports no window gets the catalog untouched: without a budget there
 * is nothing to measure against, and trimming blind would remove tools a large
 * window could carry.
 *
 * Within the budget the most recent loads win — a load order that a repeat mention
 * refreshes — so a tool squeezed out by later loads comes back when it is asked for
 * again. Everything past the budget is dropped silently: the declaration is a
 * request detail, not a promise the model has to reason about.
 * @param session - the session whose load events record what the model pulled.
 * @param contextWindow - the route's window, when the adapter reports one.
 * @param tools - the assembled catalog for this step.
 * @returns the declarations that fit.
 */
function declareWithin<T extends { readonly name: string }>(
  loaded: readonly string[],
  contextWindow: number | undefined,
  tools: T[],
): T[] {
  // Same array, not a copy: a no-op must stay a no-op for identity checks.
  if (contextWindow === undefined) return tools
  // Only a narrow route runs out of room. A wide one carries the catalog as it is,
  // so this stopgap cannot take tools away from a model that could hold them.
  if (contextWindow >= NARROW_WINDOW_TOKENS) return tools

  const core = tools.filter(tool => DECLARED_CORE.has(tool.name))
  const budgetChars = declarationBudgetChars(contextWindow)
  let spent = core.reduce((total, tool) => total + JSON.stringify(tool).length, 0)

  // A tool the model pulled with `tool_search` is declared from the next request
  // on: the loaded set is a session projection, so this survives compaction and
  // resume. The rank is the *last* load of each name, so asking again promotes it.
  const rank = new Map(loaded.map((name, index) => [name, index]))
  const pulled = tools
    .filter(tool => !DECLARED_CORE.has(tool.name) && rank.has(tool.name))
    // Most recently loaded first; a stable name tiebreak keeps headers canonical.
    .sort((left, right) => (rank.get(right.name) ?? 0) - (rank.get(left.name) ?? 0)
      || left.name.localeCompare(right.name))

  const kept = new Set(core.map(tool => tool.name))
  for (const tool of pulled) {
    const size = JSON.stringify(tool).length
    if (spent + size > budgetChars) continue
    spent += size
    kept.add(tool.name)
  }
  return tools.filter(tool => kept.has(tool.name))
}
