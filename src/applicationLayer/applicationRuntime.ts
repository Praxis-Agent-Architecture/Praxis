/*
 * 文件定位：Praxis framework / applicationLayer 本地运行时。
 * 核心目的：把 application command 转成 agentCore manifest/runtime 调用，并输出统一事件和视图。
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  praxis,
  type AgentManifest,
  type AgentRunResult,
  type RuntimeApprovalResolver,
} from "../agentCore/index.js";
import type { OpenAIV1ResponsesProviderCaller } from "../agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import type { AuthEnvelope } from "../agentCore/agent_modelAdapter/authProfileLayer/authEnvelope.js";
import { resolveProviderModelMetadata } from "../agentCore/agent_modelAdapter/providerAccessLayer/modelMetadataRegistry.js";
import type {
  PraxisApplicationCommand,
  PraxisApplicationCommandResult,
  PraxisApplicationApprovalSummary,
  PraxisApplicationAgentEntryView,
  PraxisApplicationEvent,
  PraxisApplicationManifestView,
  PraxisApplicationModelState,
  PraxisApplicationPermissionProfile,
  PraxisApplicationReasoningEffort,
  PraxisApplicationRuntime,
  PraxisApplicationRuntimeMode,
  PraxisApplicationSessionSummary,
  PraxisApplicationStatus,
  PraxisApplicationToolCatalogState,
  PraxisApplicationViewModel,
} from "./applicationContract.js";
import {
  loadApplicationProject,
  type PraxisApplicationProject,
} from "./applicationProject.js";

export type PraxisApplicationRuntimeOptions = {
  project: PraxisApplicationProject;
  applicationId?: string;
  sessionId?: string;
  runtimeId?: string;
  cwd?: string;
  mode?: PraxisApplicationRuntimeMode;
  model?: string;
  reasoningEffort?: PraxisApplicationReasoningEffort;
  permissionProfile?: PraxisApplicationPermissionProfile;
  approvalResolver?: RuntimeApprovalResolver;
  liveProviderResolver?: (manifest: AgentManifest, context?: {
    sessionId: string;
    runtimeId: string;
    turnId?: string;
    onTextDelta?: (delta: string, metadata?: Readonly<Record<string, unknown>>) => void;
  }) => Promise<{ auth: AuthEnvelope; providerCaller: OpenAIV1ResponsesProviderCaller } | undefined>;
  now?: () => string;
};

export type CreateApplicationProjectRuntimeOptions = Omit<PraxisApplicationRuntimeOptions, "project">;

type RuntimeState = {
  status: PraxisApplicationStatus;
  sessionId: string;
  runtimeId: string;
  cwd: string;
  mode: PraxisApplicationRuntimeMode;
  model: PraxisApplicationModelState;
  permissionProfile: PraxisApplicationPermissionProfile;
  turns: number;
  modelCalls: number;
  toolCalls: number;
  mainLoopSteps: number;
  finalOutput?: string;
  error?: {
    code: string;
    message: string;
  };
  manifest?: AgentManifest;
  events: PraxisApplicationEvent[];
  sessions: Map<string, PraxisApplicationSessionSummary>;
  approvals: Map<string, PraxisApplicationApprovalSummary>;
  cancelledAuxiliaryTasks: Set<string>;
};

function defaultNow(): string {
  return new Date().toISOString();
}

function event(input: Omit<PraxisApplicationEvent, "publicSafe">): PraxisApplicationEvent {
  return { ...input, publicSafe: true };
}

function cleanReasoning(value: PraxisApplicationReasoningEffort | undefined): PraxisApplicationReasoningEffort {
  return value ?? "low";
}

function createApplicationModelState(input: {
  model?: string;
  reasoningEffort?: PraxisApplicationReasoningEffort;
  provider?: string;
}): PraxisApplicationModelState {
  const provider = input.provider ?? "openai";
  const model = input.model ?? "gpt-5.5";
  const metadata = resolveProviderModelMetadata({ provider, model });
  return {
    model,
    reasoningEffort: cleanReasoning(input.reasoningEffort),
    provider,
    contextWindowTokens: metadata?.contextWindowTokens,
    maxInputTokens: metadata?.maxInputTokens,
    inputBudgetThreshold: metadata?.inputBudgetThreshold,
    usableInputTokens: metadata?.usableInputTokens,
    metadataSource: metadata?.source,
  };
}

function summarizeManifest(manifest: AgentManifest | undefined): PraxisApplicationManifestView | undefined {
  if (!manifest) return undefined;
  return {
    manifestId: manifest.manifestId,
    manifestHash: manifest.manifestHash,
    agentId: manifest.identity.id,
    promptPackId: manifest.promptPack.promptPackId,
    toolPolicyProfile: manifest.toolPolicy.profile,
    sandboxProfile: manifest.sandbox.profile,
    sessionPersistence: manifest.session.persistence,
    storageKind: manifest.storage.kind ?? "unknown",
  };
}

function summarizeToolCatalog(manifest: AgentManifest | undefined): PraxisApplicationToolCatalogState {
  const entries = praxis.inspection.createBaseToolRealityLedger();
  const byFamily: Record<string, number> = {};
  const byRiskLevel: Record<string, number> = {};
  const byReadiness: Record<string, number> = {};
  for (const entry of entries) {
    byFamily[entry.storageFamily] = (byFamily[entry.storageFamily] ?? 0) + 1;
    byRiskLevel[entry.riskLevel] = (byRiskLevel[entry.riskLevel] ?? 0) + 1;
    byReadiness[entry.developerReadiness] = (byReadiness[entry.developerReadiness] ?? 0) + 1;
  }
  const mountedToolIds = manifest?.harness.tools.map((tool) => tool.toolId).sort() ?? [];
  return {
    total: entries.length,
    mounted: mountedToolIds.length,
    byFamily,
    byRiskLevel,
    byReadiness,
    mountedToolIds,
  };
}

function summarizeAgentEntries(project: PraxisApplicationProject): readonly PraxisApplicationAgentEntryView[] {
  return Object.entries(project.agentEntries)
    .map(([key, entry]) => ({
      key,
      agentId: entry.agentId,
      role: key === "primary" ? "primary" as const : "sidecar" as const,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function safeSessionName(value: string): string {
  return value.trim().replace(/[^\p{Letter}\p{Number}._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48) || "session";
}

function extractFirstJsonObject(source: string): string {
  const fenceMatch = source.match(/```json\s*([\s\S]*?)```/iu) ?? source.match(/```\s*([\s\S]*?)```/iu);
  if (fenceMatch?.[1]) return extractFirstJsonObject(fenceMatch[1]);
  const trimmed = source.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = source.indexOf("{");
  if (start === -1) {
    throw new Error("auxiliary task output did not contain a JSON object");
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error("auxiliary task output contained an unterminated JSON object");
}

function parseAuxiliaryTaskOutput(text: string, expectedSchemaVersion: string): unknown {
  const parsed = JSON.parse(extractFirstJsonObject(text)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("auxiliary task output must be a JSON object");
  }
  const schemaVersion = (parsed as Record<string, unknown>).schemaVersion;
  if (schemaVersion !== expectedSchemaVersion) {
    throw new Error(`auxiliary task schema mismatch: expected ${expectedSchemaVersion}, got ${String(schemaVersion)}`);
  }
  return parsed;
}

async function withTimeout<T>(input: {
  promise: Promise<T>;
  timeoutMs: number;
  message: string;
}): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      input.promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(input.message)), input.timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function autoApproveForProfile(profile: PraxisApplicationPermissionProfile): RuntimeApprovalResolver | undefined {
  if (profile !== "bapr" && profile !== "yolo") return undefined;
  return async (envelope) => ({
    status: "approved",
    resolvedBy: `application.profile.${profile}`,
    reason: `${profile} profile auto-approves runtime approval requests`,
    metadata: {
      approvalId: envelope.approvalId,
      profile,
    },
  });
}

async function loadAgentExport(project: PraxisApplicationProject, input: {
  entryPath?: string;
  exportName?: string;
} = {}): Promise<unknown> {
  const module = await import(pathToFileURL(input.entryPath ?? project.agentEntryPath).href) as Record<string, unknown>;
  if (input.exportName ?? project.exportName) {
    return module[(input.exportName ?? project.exportName)!];
  }
  return module.default ?? Object.values(module)[0];
}

function applyRunResult(state: RuntimeState, result: AgentRunResult): void {
  state.modelCalls = result.ok ? result.modelCalls.length : 0;
  state.toolCalls = result.ok ? result.toolCalls.length : 0;
  state.mainLoopSteps = result.mainLoopSteps?.length ?? 0;
  state.manifest = result.manifest ?? state.manifest;
  if (result.ok) {
    state.status = "completed";
    state.finalOutput = result.finalOutput;
    state.error = undefined;
  } else {
    state.status = "failed";
    state.error = {
      code: result.error.code,
      message: result.error.message,
    };
    state.finalOutput = undefined;
  }
}

export function createPraxisApplicationRuntime(options: PraxisApplicationRuntimeOptions): PraxisApplicationRuntime {
  const now = options.now ?? defaultNow;
  const listeners = new Set<(event: PraxisApplicationEvent) => void>();
  const project = options.project;
  const applicationId = options.applicationId ?? project.applicationId;
  const state: RuntimeState = {
    status: "idle",
    sessionId: options.sessionId ?? `session.${applicationId}.default`,
    runtimeId: options.runtimeId ?? `runtime.${applicationId}`,
    cwd: path.resolve(options.cwd ?? project.projectRoot),
    mode: options.mode ?? "dry-run",
    model: createApplicationModelState({
      model: options.model,
      reasoningEffort: options.reasoningEffort,
    }),
    permissionProfile: options.permissionProfile ?? "standard",
    turns: 0,
    modelCalls: 0,
    toolCalls: 0,
    mainLoopSteps: 0,
    events: [],
    sessions: new Map(),
    approvals: new Map(),
    cancelledAuxiliaryTasks: new Set(),
  };

  function publish(input: Omit<PraxisApplicationEvent, "publicSafe" | "createdAt"> & { createdAt?: string }): PraxisApplicationEvent {
    const output = event({
      ...input,
      createdAt: input.createdAt ?? now(),
      sessionId: input.sessionId ?? state.sessionId,
      runtimeId: input.runtimeId ?? state.runtimeId,
    });
    state.events.push(output);
    touchSession();
    for (const listener of listeners) listener(output);
    return output;
  }

  function applyCommandSession(sessionId: string | undefined): void {
    if (typeof sessionId === "string" && sessionId.trim().length > 0) {
      state.sessionId = sessionId.trim();
    }
    touchSession();
  }

  function touchSession(): void {
    const current = state.sessions.get(state.sessionId);
    state.sessions.set(state.sessionId, {
      sessionId: state.sessionId,
      name: current?.name ?? state.sessionId.split(".").at(-1),
      workspaceRoot: state.cwd,
      status: state.status,
      lastActiveAt: now(),
      turns: state.turns,
    });
  }

  function view(): PraxisApplicationViewModel {
    const agentId = state.manifest?.identity.id ?? project.descriptor.agent?.id ?? "agent.unknown";
    const lines = [
      `application: ${applicationId}`,
      `project: ${project.projectId}`,
      `agent: ${agentId}`,
      `model: ${state.model.model}/${state.model.reasoningEffort}`,
      state.model.usableInputTokens
        ? `input budget: ${state.model.usableInputTokens}/${state.model.maxInputTokens} tokens @ ${Math.round((state.model.inputBudgetThreshold ?? 1) * 100)}%`
        : "input budget: unknown",
      `permission: ${state.permissionProfile}`,
      `workspace: ${state.cwd}`,
      `tools: ${summarizeToolCatalog(state.manifest).mounted}/${summarizeToolCatalog(state.manifest).total}`,
      state.finalOutput ? `final: ${state.finalOutput}` : `status: ${state.status}`,
    ];
    return {
      applicationId,
      projectId: project.projectId,
      runtimeId: state.runtimeId,
      sessionId: state.sessionId,
      agentId,
      agentEntries: summarizeAgentEntries(project),
      status: state.status,
      workspaceRoot: state.cwd,
      mode: state.mode,
      model: state.model,
      permissionProfile: state.permissionProfile,
      sessions: [...state.sessions.values()].sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt)),
      approvals: [...state.approvals.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      manifest: summarizeManifest(state.manifest),
      tools: summarizeToolCatalog(state.manifest),
      counters: {
        turns: state.turns,
        events: state.events.length,
        modelCalls: state.modelCalls,
        toolCalls: state.toolCalls,
        mainLoopSteps: state.mainLoopSteps,
      },
      finalOutput: state.finalOutput,
      error: state.error,
      lines,
      events: state.events,
    };
  }

  async function compileManifest(
    agentKey = "primary",
    options: { updateState?: boolean; agentOptions?: unknown } = {},
  ): Promise<{ ok: true; manifest: AgentManifest } | { ok: false; code: string; message: string }> {
    try {
      const entry = project.agentEntries[agentKey];
      if (!entry) {
        return { ok: false, code: "AGENT_ENTRY_NOT_FOUND", message: `agent entry was not found for ${agentKey}` };
      }
      const loadedSource = await loadAgentExport(project, {
        entryPath: entry.entryPath,
        exportName: entry.exportName,
      });
      const source = options.agentOptions && typeof loadedSource === "function"
        ? new (loadedSource as new (agentOptions: unknown) => unknown)(options.agentOptions)
        : loadedSource;
      const compiled = praxis.compileAgent(source as never);
      if (!compiled.ok) {
        return { ok: false, code: "AGENT_COMPILE_FAILED", message: compiled.error.message };
      }
      const validation = praxis.validateAgentManifest(compiled.manifest);
      if (!validation.ok) {
        return { ok: false, code: "AGENT_MANIFEST_INVALID", message: validation.error.message };
      }
      if (options.updateState ?? agentKey === "primary") {
        state.manifest = validation.manifest;
      }
      return { ok: true, manifest: validation.manifest };
    } catch (error) {
      return {
        ok: false,
        code: "AGENT_LOAD_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function submitAuxiliaryTask(command: Extract<PraxisApplicationCommand, { type: "application.invokeAuxiliaryTask" }>): Promise<PraxisApplicationCommandResult> {
    const parentSessionId = state.sessionId;
    const taskSessionId = command.sessionId?.trim()
      || `session.${applicationId}.aux.${safeSessionName(command.taskKind)}`;
    state.sessions.set(taskSessionId, {
      sessionId: taskSessionId,
      name: taskSessionId.split(".").at(-1),
      workspaceRoot: state.cwd,
      status: "running",
      lastActiveAt: now(),
      turns: 0,
    });
    const agentKey = command.agentKey ?? "tui";
    const agentId = command.agentId ?? project.agentEntries[agentKey]?.agentId ?? `agent.${project.projectId}.${agentKey}`;
    const correlationId = command.correlationId ?? `aux.${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const timeoutMs = Math.max(1, command.timeoutMs ?? 1800);
    const started = publish({
      eventId: `${correlationId}.started`,
      kind: "model",
      status: state.status,
      message: `auxiliary task started: ${command.taskKind}`,
      sessionId: parentSessionId,
      metadata: {
        agentId,
        agentKey,
        taskKind: command.taskKind,
        schemaVersion: command.schemaVersion,
        correlationId,
        auxiliarySessionId: taskSessionId,
        timeoutMs,
      },
    });

    const compiled = await compileManifest(agentKey, {
      updateState: false,
      agentOptions: {
        model: command.model,
        reasoningEffort: command.reasoningEffort,
        timeoutMs,
      },
    });
    if (!compiled.ok) {
      const failed = publish({
        eventId: `${correlationId}.failed`,
        kind: "error",
        status: state.status,
        message: compiled.message,
        sessionId: parentSessionId,
        metadata: {
          code: compiled.code,
          agentId,
          agentKey,
          taskKind: command.taskKind,
          correlationId,
        },
      });
      return { ok: false, view: view(), events: [started, failed], error: { code: compiled.code, message: compiled.message } };
    }

    let liveProvider: { auth: AuthEnvelope; providerCaller: OpenAIV1ResponsesProviderCaller } | undefined;
    if ((command.mode ?? state.mode) === "live") {
      try {
        liveProvider = await options.liveProviderResolver?.(compiled.manifest, {
          sessionId: taskSessionId,
          runtimeId: state.runtimeId,
          turnId: correlationId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = publish({
          eventId: `${correlationId}.failed`,
          kind: "error",
          status: state.status,
          message,
          sessionId: parentSessionId,
          metadata: {
            code: "AUXILIARY_PROVIDER_RESOLUTION_FAILED",
            agentId,
            agentKey,
            taskKind: command.taskKind,
            correlationId,
          },
        });
        return { ok: false, view: view(), events: [started, failed], error: { code: "AUXILIARY_PROVIDER_RESOLUTION_FAILED", message } };
      }
    }

    const taskText = JSON.stringify({
      taskKind: command.taskKind,
      schemaVersion: command.schemaVersion,
      input: command.input,
    });
    try {
      const runtime = praxis.runtime.createPraxisRuntimeKernel({
        runtimeId: `${state.runtimeId}.aux.${safeSessionName(command.taskKind)}`,
      });
      if (state.cancelledAuxiliaryTasks.has(correlationId)) {
        throw new Error(`auxiliary task cancelled: ${correlationId}`);
      }
      const result = await withTimeout({
        promise: runtime.runManifest(compiled.manifest, taskText, {
          runtimeId: `${state.runtimeId}.aux.${safeSessionName(command.taskKind)}`,
          sessionId: taskSessionId,
          dryRun: (command.mode ?? state.mode) !== "live",
          allowProviderCall: (command.mode ?? state.mode) === "live",
          allowToolExecution: false,
          auth: liveProvider?.auth,
          providerCaller: liveProvider?.providerCaller,
          exposeProviderTools: false,
          approvalResolver: options.approvalResolver ?? autoApproveForProfile(state.permissionProfile),
          storage: {
            cwd: state.cwd,
            workspaceRoot: path.join(project.projectRoot, ".raxode"),
            initMode: "on-run",
          },
          sandbox: { cwd: state.cwd },
          now,
        }),
        timeoutMs,
        message: `auxiliary task timed out after ${timeoutMs}ms`,
      });
      if (!result.ok) {
        const failed = publish({
          eventId: `${correlationId}.failed`,
          kind: "error",
          status: state.status,
          message: result.error.message,
          sessionId: parentSessionId,
          metadata: {
            code: result.error.code,
            agentId,
            agentKey,
            taskKind: command.taskKind,
            correlationId,
          },
        });
        return { ok: false, view: view(), events: [started, failed], error: result.error };
      }
      if (state.cancelledAuxiliaryTasks.has(correlationId)) {
        throw new Error(`auxiliary task cancelled: ${correlationId}`);
      }
      const output = parseAuxiliaryTaskOutput(result.finalOutput, command.schemaVersion);
      const completed = publish({
        eventId: `${correlationId}.completed`,
        kind: "model",
        status: state.status,
        message: `auxiliary task completed: ${command.taskKind}`,
        sessionId: parentSessionId,
        metadata: {
          agentId,
          agentKey,
          taskKind: command.taskKind,
          schemaVersion: command.schemaVersion,
          correlationId,
          auxiliarySessionId: taskSessionId,
        },
      });
      return { ok: true, view: view(), events: [started, completed], output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = publish({
        eventId: `${correlationId}.failed`,
        kind: "error",
        status: state.status,
        message,
        sessionId: parentSessionId,
        metadata: {
          code: "AUXILIARY_TASK_FAILED",
          agentId,
          agentKey,
          taskKind: command.taskKind,
          correlationId,
        },
      });
      return { ok: false, view: view(), events: [started, failed], error: { code: "AUXILIARY_TASK_FAILED", message } };
    }
  }

  async function submitTurn(command: Extract<PraxisApplicationCommand, { type: "application.submitTurn" }>): Promise<PraxisApplicationCommandResult> {
    applyCommandSession(command.sessionId);
    state.status = "running";
    state.mode = command.mode ?? state.mode;
    state.cwd = path.resolve(command.input.cwd ?? state.cwd);
    state.turns += 1;
    const turnId = `turn.${state.turns}`;
    publish({
      eventId: `${turnId}.submitted`,
      kind: "conversation",
      status: "running",
      message: command.input.text,
      turnId,
      metadata: {
        attachments: command.input.attachments?.length ?? 0,
      },
    });

    const compiled = await compileManifest();
    if (!compiled.ok) {
      state.status = "failed";
      state.error = { code: compiled.code, message: compiled.message };
      const failed = publish({
        eventId: `${turnId}.failed`,
        kind: "error",
        status: "failed",
        message: compiled.message,
        turnId,
        metadata: { code: compiled.code },
      });
      return { ok: false, view: view(), events: [failed], error: state.error };
    }

    publish({
      eventId: `${turnId}.manifest.ready`,
      kind: "runtime",
      status: "running",
      message: `manifest ready: ${compiled.manifest.identity.id}`,
      turnId,
      metadata: {
        manifestId: compiled.manifest.manifestId,
        manifestHash: compiled.manifest.manifestHash,
        mountedTools: compiled.manifest.harness.tools.length,
      },
    });

    let liveProvider: { auth: AuthEnvelope; providerCaller: OpenAIV1ResponsesProviderCaller } | undefined;
    if (state.mode === "live") {
      try {
        let streamSequence = 0;
        liveProvider = await options.liveProviderResolver?.(compiled.manifest, {
          sessionId: state.sessionId,
          runtimeId: state.runtimeId,
          turnId,
          onTextDelta: (delta, metadata) => {
            if (delta.length === 0) return;
            streamSequence += 1;
            publish({
              eventId: `${turnId}.stream.${streamSequence}`,
              kind: "stream",
              status: "running",
              message: delta,
              turnId,
              metadata: {
                ...(metadata ?? {}),
                sequence: streamSequence,
                channel: "assistant",
              },
            });
          },
        });
      } catch (error) {
        state.status = "failed";
        state.error = {
          code: "LIVE_PROVIDER_RESOLUTION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        };
        const failed = publish({
          eventId: `${turnId}.failed`,
          kind: "error",
          status: "failed",
          message: state.error.message,
          turnId,
          metadata: { code: state.error.code },
        });
        return { ok: false, view: view(), events: [failed], error: state.error };
      }
    }

    const runtime = praxis.runtime.createPraxisRuntimeKernel({ runtimeId: state.runtimeId });
    const result = await runtime.runManifest(compiled.manifest, command.input.text, {
      runtimeId: state.runtimeId,
      sessionId: state.sessionId,
      dryRun: state.mode !== "live",
      allowProviderCall: state.mode === "live",
      allowToolExecution: state.mode === "live",
      auth: liveProvider?.auth,
      providerCaller: liveProvider?.providerCaller,
      exposeProviderTools: true,
      approvalResolver: options.approvalResolver ?? autoApproveForProfile(state.permissionProfile),
      storage: {
        cwd: state.cwd,
        workspaceRoot: path.join(project.projectRoot, ".raxode"),
        initMode: "on-run",
      },
      sandbox: { cwd: state.cwd },
      now,
    });
    applyRunResult(state, result);
    const done = publish({
      eventId: `${turnId}.${result.ok ? "completed" : "failed"}`,
      kind: result.ok ? "final" : "error",
      status: result.ok ? "completed" : "failed",
      message: result.ok ? result.finalOutput : result.error.message,
      turnId,
      metadata: {
        modelCalls: state.modelCalls,
        toolCalls: state.toolCalls,
        mainLoopSteps: state.mainLoopSteps,
      },
    });
    return result.ok
      ? { ok: true, view: view(), events: [done] }
      : { ok: false, view: view(), events: [done], error: state.error ?? { code: "RUNTIME_FAILED", message: "runtime failed" } };
  }

  return {
    applicationId,
    projectId: project.projectId,
    getView: view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispatch(command): Promise<PraxisApplicationCommandResult> {
      switch (command.type) {
        case "application.start": {
          applyCommandSession(command.sessionId);
          state.cwd = path.resolve(command.cwd ?? state.cwd);
          state.mode = command.mode ?? state.mode;
          const compiled = await compileManifest();
          if (!compiled.ok) {
            state.status = "failed";
            state.error = { code: compiled.code, message: compiled.message };
            const failed = publish({
              eventId: "application.start.failed",
              kind: "error",
              status: "failed",
              message: compiled.message,
              metadata: { code: compiled.code },
            });
            return { ok: false, view: view(), events: [failed], error: state.error };
          }
          state.status = "ready";
          const ready = publish({
            eventId: "application.ready",
            kind: "lifecycle",
            status: "ready",
            message: "application runtime is ready",
            metadata: {
              manifestId: compiled.manifest.manifestId,
              mountedTools: compiled.manifest.harness.tools.length,
            },
          });
          return { ok: true, view: view(), events: [ready] };
        }
        case "application.submitTurn":
          return await submitTurn(command);
        case "application.invokeAuxiliaryTask":
          return await submitAuxiliaryTask(command);
        case "application.cancelAuxiliaryTask": {
          applyCommandSession(command.sessionId);
          state.cancelledAuxiliaryTasks.add(command.correlationId);
          const cancelled = publish({
            eventId: `${command.correlationId}.cancelled`,
            kind: "runtime",
            status: state.status,
            message: command.reason ?? `auxiliary task cancelled: ${command.correlationId}`,
            metadata: {
              correlationId: command.correlationId,
              auxiliary: true,
            },
          });
          return { ok: true, view: view(), events: [cancelled] };
        }
        case "application.switchWorkspace": {
          applyCommandSession(command.sessionId);
          state.cwd = path.resolve(command.cwd);
          const switched = publish({
            eventId: "application.workspace.switched",
            kind: "workspace",
            status: state.status,
            message: state.cwd,
          });
          return { ok: true, view: view(), events: [switched] };
        }
        case "application.changeModel": {
          applyCommandSession(command.sessionId);
          state.model = {
            ...createApplicationModelState({
              model: command.model,
              reasoningEffort: command.reasoningEffort ?? state.model.reasoningEffort,
              provider: state.model.provider,
            }),
          };
          const changed = publish({
            eventId: "application.model.changed",
            kind: "model",
            status: state.status,
            message: `${state.model.model}/${state.model.reasoningEffort}`,
          });
          return { ok: true, view: view(), events: [changed] };
        }
        case "application.changePermissionProfile": {
          applyCommandSession(command.sessionId);
          state.permissionProfile = command.profile;
          const changed = publish({
            eventId: "application.permission.changed",
            kind: "permission",
            status: state.status,
            message: command.profile,
          });
          return { ok: true, view: view(), events: [changed] };
        }
        case "application.interrupt": {
          applyCommandSession(command.sessionId);
          state.status = "ready";
          const interrupted = publish({
            eventId: "application.interrupted",
            kind: "lifecycle",
            status: "ready",
            message: command.reason ?? "interrupted",
          });
          return { ok: true, view: view(), events: [interrupted] };
        }
        case "application.resume": {
          applyCommandSession(command.sessionId);
          state.status = "ready";
          const resumed = publish({
            eventId: "application.resumed",
            kind: "lifecycle",
            status: "ready",
            message: "session resumed",
          });
          return { ok: true, view: view(), events: [resumed] };
        }
        case "application.createSession": {
          const createdSessionId = command.sessionId?.trim()
            || `session.${applicationId}.${safeSessionName(command.name ?? String(state.sessions.size + 1))}`;
          state.sessionId = createdSessionId;
          if (command.cwd) state.cwd = path.resolve(command.cwd);
          state.status = "ready";
          state.sessions.set(state.sessionId, {
            sessionId: state.sessionId,
            name: command.name?.trim() || state.sessionId.split(".").at(-1),
            workspaceRoot: state.cwd,
            status: state.status,
            lastActiveAt: now(),
            turns: state.turns,
          });
          const created = publish({
            eventId: "application.session.created",
            kind: "lifecycle",
            status: "ready",
            message: state.sessionId,
          });
          return { ok: true, view: view(), events: [created] };
        }
        case "application.renameSession": {
          applyCommandSession(command.sessionId);
          const current = state.sessions.get(state.sessionId);
          state.sessions.set(state.sessionId, {
            sessionId: state.sessionId,
            name: command.name.trim(),
            workspaceRoot: current?.workspaceRoot ?? state.cwd,
            status: current?.status ?? state.status,
            lastActiveAt: now(),
            turns: current?.turns ?? state.turns,
          });
          const renamed = publish({
            eventId: "application.session.renamed",
            kind: "lifecycle",
            status: state.status,
            message: `${state.sessionId}:${command.name.trim()}`,
          });
          return { ok: true, view: view(), events: [renamed] };
        }
        case "application.rewind": {
          applyCommandSession(command.sessionId);
          const rewound = publish({
            eventId: "application.rewind.planned",
            kind: "runtime",
            status: state.status,
            message: command.turnId ?? String(command.turnIndex ?? "latest"),
          });
          return { ok: true, view: view(), events: [rewound] };
        }
        case "application.approvalDecision": {
          applyCommandSession(command.sessionId);
          state.approvals.set(command.approvalId, {
            approvalId: command.approvalId,
            decision: command.decision,
            status: "decided",
            note: command.note,
            updatedAt: now(),
          });
          const approval = publish({
            eventId: "application.approval.decided",
            kind: "approval",
            status: state.status,
            message: `${command.approvalId}:${command.decision}`,
            metadata: {
              approvalId: command.approvalId,
              decision: command.decision,
              note: command.note,
            },
          });
          return { ok: true, view: view(), events: [approval] };
        }
        case "application.requestApproval": {
          applyCommandSession(command.sessionId);
          state.status = "awaiting-approval";
          state.approvals.set(command.approvalId, {
            approvalId: command.approvalId,
            status: "pending",
            note: command.reason,
            updatedAt: now(),
          });
          const requested = publish({
            eventId: "application.approval.requested",
            kind: "approval",
            status: "awaiting-approval",
            message: `${command.approvalId}:${command.reason}`,
            metadata: {
              approvalId: command.approvalId,
              reason: command.reason,
            },
          });
          return { ok: true, view: view(), events: [requested] };
        }
        case "application.close": {
          applyCommandSession(command.sessionId);
          state.status = "closed";
          const closed = publish({
            eventId: "application.closed",
            kind: "lifecycle",
            status: "closed",
            message: "application runtime closed",
          });
          return { ok: true, view: view(), events: [closed] };
        }
      }
    },
  };
}

export async function createApplicationProjectRuntime(
  projectRoot: string,
  options: CreateApplicationProjectRuntimeOptions = {},
): Promise<
  | { ok: true; runtime: PraxisApplicationRuntime }
  | { ok: false; error: { code: string; message: string } }
> {
  const loaded = await loadApplicationProject(projectRoot);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    runtime: createPraxisApplicationRuntime({
      ...options,
      project: loaded.project,
    }),
  };
}
