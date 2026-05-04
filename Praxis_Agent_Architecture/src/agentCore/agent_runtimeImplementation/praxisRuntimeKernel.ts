/*
 * 文件定位：Agent 运行态实现层 / PraxisRuntimeKernel。
 * 核心目的：执行已编译 AgentManifest，把 text IO、codex responses、BaseTool mount 和 session/event 记录串成第一条可用 agent 链。
 * 能力要求1：runtime 执行 manifest，不直接执行 Agent class 内部逻辑，run(agent) 只作为 compile 后的语法糖。
 * 能力要求2：支持 codex_responses 模型调用、一次工具调用回填、BaseToolExecutorPort 注入和最小 session/state/event 记录。
 * 边界：不设计 promptPack 终局语义，不加厚 mainLoop/coreLogic 动作原语，不吞并 baseTool storage 语义。
 * 对接：需要服务 OAO compile、runtime.modelAdapter、runtime.execEngine、IOTransceiver 和后续 inspection/debug。
 * 实现提示：先提供可测试纵向闭环，再由用户监督 promptPack 与 mainLoop/coreLogic 的正式设计。
 */

import type { AuthEnvelope } from "../agent_modelAdapter/authProfileLayer/authEnvelope.js";
import type { OpenAIV1ResponsesProviderCaller } from "../agent_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import type { BaseToolExecutorPort } from "../agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { receiveTextInput } from "../agent_executionEngine/IOTransceiver/inputReceiver/textReceiver.js";
import { exposeTextOutput } from "../agent_executionEngine/IOTransceiver/outputExposer/textExposer.js";
import {
  createMainLoopStepRecord,
  planFrameworkMainLoopHandoff,
  type MainLoopStepRecord,
} from "../agent_executionEngine/coreLogic/mainLoop.js";
import {
  interpretModelDecision,
} from "../agent_executionEngine/coreLogic/modelDecision.js";
import {
  type EphemeralProcedurePlan,
  type EphemeralProcedureStep,
} from "../agent_executionEngine/coreLogic/ephemeralProcedure.js";
import {
  createObservationMaterial,
  type RuntimeObservationMaterial,
} from "../agent_executionEngine/coreLogic/observationIntegrator.js";
import {
  assemblePromptPack,
  type StandardPromptPack,
} from "../agent_executionEngine/promptPack/promptAssembler.js";
import {
  definePromptPack,
  type PromptPackMaterialDraft,
} from "../agent_executionEngine/promptPack/promptDefiner.js";
import {
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
  type RuntimeBaseToolExecutorPolicy,
  type RuntimeBaseToolExecutorResourceLimits,
} from "./runtime.execEngine/baseToolExecutorPortFactory.js";
import { evaluateBaseToolRuntimeGovernance, type BaseToolRuntimeGovernanceDecision } from "./runtime.execEngine/baseToolRuntimeGovernance.js";
import {
  preflightBaseToolDependencies,
  type BaseToolDependencyRuntimeMode,
} from "./runtime.execEngine/baseToolDependencyRuntime.js";
import { invokeMountedBaseTool } from "./runtime.execEngine/baseToolRuntimeMount.js";
import { evaluateBaseToolRuntimeReadiness } from "./runtime.execEngine/baseToolSupportCatalog.js";
import { invokeModelThroughRuntime } from "./runtime.modelAdapter/modelInvocationRuntime.js";
import {
  lowerPromptForModelAdapter,
  type LoweredPromptEnvelope,
} from "./runtime.modelAdapter/promptLoweringRuntime.js";
import {
  compileAgent,
  type AgentManifest,
  type PraxisAgent,
  type PraxisAgentInput,
} from "./runtimeAgentManifest.js";
import type { ToolDependencyProbe } from "../agent_executionEngine/basic_toolLayer/toolDependency/dependencyManager.js";
import {
  createInMemorySessionStateEventStore,
  type RuntimeEventRecord,
  type RuntimeInvocationRecord,
  type RuntimeApprovalRecord,
  type RuntimePublicSafeErrorRecord,
  type RuntimeProcedureRecord,
  type RuntimeSessionSnapshot,
  type RuntimeSessionStateEventStore,
  type RuntimeStateRecord,
} from "./runtimeSessionStateEventStore.js";

export type PraxisRuntimeKernelErrorCode =
  | "MANIFEST_COMPILE_FAILED"
  | "TEXT_INPUT_REJECTED"
  | "PROMPT_PACK_FAILED"
  | "MODEL_INVOCATION_FAILED"
  | "MODEL_DECISION_FAILED"
  | "TOOL_INVOCATION_FAILED"
  | "PROCEDURE_INVOCATION_FAILED"
  | "APPROVAL_REQUIRED"
  | "TEXT_OUTPUT_REJECTED";

export type PraxisRuntimeKernelError = {
  code: PraxisRuntimeKernelErrorCode;
  message: string;
  boundary: "compile" | "io" | "model" | "tool" | "runtime-state";
  publicSafe: true;
};

export type PraxisRuntimeKernelOptions = {
  runtimeId?: string;
  sessionId?: string;
  auth?: AuthEnvelope;
  providerCaller?: OpenAIV1ResponsesProviderCaller;
  executor?: BaseToolExecutorPort;
  baseToolPolicy?: RuntimeBaseToolExecutorPolicy;
  baseToolResourceLimits?: RuntimeBaseToolExecutorResourceLimits;
  store?: RuntimeSessionStateEventStore;
  allowProviderCall?: boolean;
  allowToolExecution?: boolean;
  dryRun?: boolean;
  approvalResolver?: RuntimeApprovalResolver;
  baseToolDependencyRuntime?: {
    mode?: BaseToolDependencyRuntimeMode;
    probes?: readonly ToolDependencyProbe[];
    managedRoot?: string;
    env?: Readonly<Record<string, string | undefined>>;
    homeDir?: string;
    timeoutMs?: number;
  };
  now?: () => string;
};

export type RuntimeApprovalEnvelope = {
  approvalId: string;
  runtimeId: string;
  sessionId: string;
  source: RuntimeApprovalRecord["source"];
  reason: string;
  requestedScopes: readonly string[];
  riskLevel?: string;
  interfaceSurface: RuntimeApprovalRecord["interfaceSurface"];
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeApprovalResolution = {
  status: "approved" | "denied" | "pending";
  resolvedBy?: string;
  reason?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeApprovalResolver = (
  envelope: RuntimeApprovalEnvelope,
) => RuntimeApprovalResolution | Promise<RuntimeApprovalResolution>;

export type AgentToolCallRecord = {
  callId: string;
  toolId: string;
  arguments: Readonly<Record<string, unknown>>;
  ok: boolean;
  output?: unknown;
  error?: unknown;
};

export type AgentModelCallRecord = {
  invocationId: string;
  raw: unknown;
  ok: boolean;
};

export type AgentRunResult =
  | {
      ok: true;
      runtimeId: string;
      sessionId: string;
      manifest: AgentManifest;
      finalOutput: string;
      modelCalls: readonly AgentModelCallRecord[];
      toolCalls: readonly AgentToolCallRecord[];
      mainLoopSteps: readonly MainLoopStepRecord[];
      events: readonly string[];
      state: RuntimeSessionSnapshot;
    }
  | {
      ok: false;
      runtimeId?: string;
      sessionId?: string;
      manifest?: AgentManifest;
      error: PraxisRuntimeKernelError;
      mainLoopSteps?: readonly MainLoopStepRecord[];
      events: readonly string[];
      state?: RuntimeSessionSnapshot;
    };

type ProviderToolMapping = {
  providerName: string;
  toolId: string;
};

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultNow(): string {
  return new Date().toISOString();
}

function runtimeIdFor(manifest: AgentManifest): string {
  return `runtime:${manifest.identity.id}`;
}

function sessionIdFor(runtimeId: string, manifest: AgentManifest): string {
  return `${runtimeId}:session:${manifest.manifestHash.slice(0, 12)}`;
}

function event(
  sessionId: string,
  eventId: string,
  type: string,
  createdAt: string,
  payload: Readonly<Record<string, unknown>> = {},
): RuntimeEventRecord {
  return { sessionId, eventId, type, createdAt, payload };
}

function state(
  sessionId: string,
  stateId: string,
  phase: string,
  createdAt: string,
  metadata: Readonly<Record<string, unknown>> = {},
): RuntimeStateRecord {
  return { sessionId, stateId, phase, createdAt, metadata };
}

function invocation(
  sessionId: string,
  invocationId: string,
  kind: RuntimeInvocationRecord["kind"],
  target: string,
  ok: boolean,
  createdAt: string,
  summary: Readonly<Record<string, unknown>> = {},
): RuntimeInvocationRecord {
  return { sessionId, invocationId, kind, target, ok, createdAt, summary };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function providerToolName(toolId: string): string {
  const normalized = toolId.replace(/[^a-zA-Z0-9_-]/gu, "_").replace(/^_+/u, "");
  return `praxis_tool_${normalized || "tool"}`;
}

function providerToolMappings(manifest: AgentManifest): readonly ProviderToolMapping[] {
  const usedProviderNames = new Set<string>();
  return manifest.harness.tools.map((tool) => {
    const baseProviderName = providerToolName(tool.toolId);
    let providerName = baseProviderName;
    let suffix = 2;
    while (usedProviderNames.has(providerName)) {
      providerName = `${baseProviderName}_${suffix}`;
      suffix += 1;
    }
    usedProviderNames.add(providerName);
    return {
      providerName,
      toolId: tool.toolId,
    };
  });
}

function enrichToolArguments(
  manifest: AgentManifest,
  args: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const rawContext = isRecord(args.context) ? args.context : {};
  const workspaceRoot = readString(args.workspaceRoot) ?? manifest.harness.policy.workspaceRoot;
  const allowedRoots = Array.isArray(args.allowedRoots)
    ? args.allowedRoots
    : manifest.harness.policy.allowedRoots;

  return {
    ...args,
    ...(args.dryRun === undefined ? { dryRun: false } : {}),
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
    context: {
      ...rawContext,
      dryRun: rawContext.dryRun ?? args.dryRun ?? false,
      guard: isRecord(rawContext.guard)
        ? { accepted: true, allowed: true, ...rawContext.guard }
        : { accepted: true, allowed: true },
      ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
      ...(allowedRoots === undefined ? {} : { allowedRoots }),
    },
  };
}

function metadataRecord(value: Readonly<Record<string, unknown>>): Readonly<Record<string, string | number | boolean | object>> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string | number | boolean | object] => {
      const candidate = entry[1];
      return ["string", "number", "boolean"].includes(typeof candidate) || (typeof candidate === "object" && candidate !== null);
    }),
  );
}

function promptMaterialsForTurn(input: {
  manifest: AgentManifest;
  task: string;
  turnIndex: number;
  toolMappings: readonly ProviderToolMapping[];
  observations: readonly RuntimeObservationMaterial[];
  events: readonly string[];
}): readonly PromptPackMaterialDraft[] {
  const toolMaterials = input.manifest.harness.tools.map((tool, index): PromptPackMaterialDraft => {
    const providerName = input.toolMappings.find((mapping) => mapping.toolId === tool.toolId)?.providerName ?? providerToolName(tool.toolId);
    return {
      id: `tool:${tool.toolId}`,
      kind: "tool",
      text: tool.description ?? `Mounted BaseTool ${tool.toolId}`,
      source: "runtime.mountedBaseTool",
      priority: 80 - index,
      trusted: true,
      scope: "runtime.toolProjection",
      metadata: {
        toolMaterialType: "declaration",
        toolId: tool.toolId,
        toolName: providerName,
        toolDescription: tool.description ?? `Praxis BaseTool ${tool.toolId}`,
        inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: true },
      },
    };
  });

  const observationMaterials = input.observations.map((observation) => observation.material);
  return [
    {
      id: `task:${input.turnIndex}`,
      kind: "user",
      text: input.task,
      source: "runtime.input.text",
      priority: 100,
      trusted: false,
      scope: "user.task",
      metadata: { turnIndex: input.turnIndex },
    },
    {
      id: `runtime:${input.turnIndex}`,
      kind: "runtime",
      text: [
        `turnIndex=${input.turnIndex}`,
        `runtime mounted BaseTools=${input.manifest.harness.tools.map((tool) => tool.toolId).join(", ") || "none"}`,
        `recent events=${input.events.slice(-8).join(", ") || "none"}`,
      ].join("\n"),
      source: "runtime.stateProjection",
      priority: 60,
      trusted: true,
      scope: "runtime.state",
      metadata: {
        turnIndex: input.turnIndex,
        maxModelTurns: input.manifest.harness.loop.maxModelTurns ?? 2,
        maxToolCalls: input.manifest.harness.loop.maxToolCalls ?? 4,
      },
    },
    ...toolMaterials,
    ...observationMaterials,
  ];
}

function buildCodexResponsesBodyFromPromptPack(
  manifest: AgentManifest,
  promptPack: StandardPromptPack,
  mappings: readonly ProviderToolMapping[],
): Readonly<Record<string, unknown>> {
  const baseToolDeclarations = manifest.harness.tools.map((tool) => ({
    type: "function",
    name: mappings.find((mapping) => mapping.toolId === tool.toolId)?.providerName ?? providerToolName(tool.toolId),
    description: tool.description ?? `Praxis baseTool ${tool.toolId}`,
    parameters: tool.inputSchema ?? { type: "object", additionalProperties: true },
  }));
  const runtimeDecisionDeclarations = [
    {
      type: "function",
      name: "praxis_ephemeral_procedure",
      description: "Plan a one-time governed orchestration of already mounted Praxis BaseTools. This does not create a new tool or TAP capability.",
      parameters: {
        type: "object",
        additionalProperties: true,
        required: ["procedureId", "purpose", "steps"],
        properties: {
          procedureId: { type: "string" },
          purpose: { type: "string" },
          executionMode: { type: "string", enum: ["serial", "parallel", "mixed"] },
          approval: {
            type: "object",
            additionalProperties: true,
            properties: {
              required: { type: "boolean" },
              reason: { type: "string" },
            },
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["stepId", "baseToolId", "input"],
              properties: {
                stepId: { type: "string" },
                baseToolId: { type: "string" },
                input: { type: "object", additionalProperties: true },
                dependsOn: { type: "array", items: { type: "string" } },
                riskLevel: { type: "string", enum: ["low", "medium", "high"] },
                outputRef: { type: "string" },
              },
            },
          },
        },
      },
    },
    {
      type: "function",
      name: "praxis_request_approval",
      description: "Ask the Praxis runtime for approval before continuing a governed model/tool action.",
      parameters: {
        type: "object",
        additionalProperties: true,
        properties: {
          reason: { type: "string" },
          requestedScopes: { type: "array", items: { type: "string" } },
          riskLevel: { type: "string" },
        },
      },
    },
  ];
  return {
    model: manifest.model.model,
    input: [
      {
        role: "developer",
        content: [{
          type: "input_text",
          text: "You are running inside PraxisRuntimeKernel. Use the Praxis PromptPack as current situation context; request mounted BaseTools only through declared function calls.",
        }],
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: promptPack.renderedText,
        }],
      },
    ],
    tools: [...baseToolDeclarations, ...runtimeDecisionDeclarations],
  };
}

function kernelError(
  code: PraxisRuntimeKernelErrorCode,
  message: string,
  boundary: PraxisRuntimeKernelError["boundary"],
): PraxisRuntimeKernelError {
  return { code, message, boundary, publicSafe: true };
}

async function recordMainLoopStep(input: {
  store: RuntimeSessionStateEventStore;
  sessionId: string;
  step: MainLoopStepRecord;
  createdAt: string;
  events: string[];
  mainLoopSteps: MainLoopStepRecord[];
}): Promise<void> {
  input.mainLoopSteps.push(input.step);
  input.events.push(`mainLoop.${input.step.actionPrimitive}.${input.step.status}`);
  await input.store.appendMainLoopStep(input.step);
  await input.store.appendEvent(event(
    input.sessionId,
    `event:${input.step.stepId}`,
    "runtime.mainLoop.step",
    input.createdAt,
    { step: input.step },
  ));
}

async function recordKernelError(input: {
  store: RuntimeSessionStateEventStore;
  sessionId: string;
  errorId: string;
  error: PraxisRuntimeKernelError | RuntimePublicSafeErrorRecord;
  createdAt: string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<void> {
  const boundary =
    input.error.boundary === "compile"
      ? "runtime-state"
      : input.error.boundary === "io"
        ? "io"
        : input.error.boundary === "runtime-state"
          ? "runtime-state"
          : input.error.boundary;
  await input.store.appendPublicSafeError({
    sessionId: input.sessionId,
    errorId: input.errorId,
    code: input.error.code,
    message: input.error.message,
    boundary,
    createdAt: input.createdAt,
    metadata: input.metadata ?? {},
    publicSafe: true,
  });
}

async function recordHandoffPlan(input: {
  store: RuntimeSessionStateEventStore;
  sessionId: string;
  createdAt: string;
  events: string[];
  mainLoopSteps: MainLoopStepRecord[];
  turnIndex: number;
  startStepIndex: number;
  tickKind: "model-only" | "tool-call" | "ephemeral-procedure" | "approval-wait" | "resume" | "interrupt" | "failure";
  promptPackRef?: string;
  loweredPromptRef?: string;
  modelCallId?: string;
  toolCallId?: string;
  procedureId?: string;
  observationRefs?: readonly string[];
  inputRefs?: readonly string[];
  outputRefs?: readonly string[];
  error?: MainLoopStepRecord["error"];
}): Promise<void> {
  const plan = planFrameworkMainLoopHandoff({
    sessionId: input.sessionId,
    turnIndex: input.turnIndex,
    startStepIndex: input.startStepIndex,
    now: input.createdAt,
    tickKind: input.tickKind,
    promptPackRef: input.promptPackRef,
    loweredPromptRef: input.loweredPromptRef,
    modelCallId: input.modelCallId,
    toolCallId: input.toolCallId,
    procedureId: input.procedureId,
    observationRefs: input.observationRefs,
    inputRefs: input.inputRefs,
    outputRefs: input.outputRefs,
    error: input.error,
  });
  input.events.push(...plan.events);
  if (!plan.ok) {
    return;
  }
  for (const step of plan.plan.stepRecords) {
    await recordMainLoopStep({
      store: input.store,
      sessionId: input.sessionId,
      createdAt: input.createdAt,
      events: input.events,
      mainLoopSteps: input.mainLoopSteps,
      step,
    });
  }
}

function promptLoweringMaterials(promptPack: StandardPromptPack): readonly {
  kind: string;
  ref: string;
  text: string;
  sourceCategory?: "declared-built-in" | "process-product" | "user-request";
  priority: number;
  metadata: Readonly<Record<string, unknown>>;
}[] {
  return promptPack.materials.map((material) => ({
    kind: material.kind,
    ref: material.id,
    text: material.text,
    sourceCategory: material.sourceCategory,
    priority: material.priority,
    metadata: material.metadata,
  }));
}

async function requestRuntimeApproval(input: {
  runtimeId: string;
  sessionId: string;
  approvalId: string;
  source: RuntimeApprovalRecord["source"];
  reason: string;
  requestedScopes: readonly string[];
  riskLevel?: string;
  interfaceSurface?: RuntimeApprovalRecord["interfaceSurface"];
  resolver?: RuntimeApprovalResolver;
  store: RuntimeSessionStateEventStore;
  now: () => string;
  metadata?: Readonly<Record<string, unknown>>;
}): Promise<{ status: "approved" | "denied" | "pending"; envelope: RuntimeApprovalEnvelope; events: readonly string[]; reason?: string }> {
  const createdAt = input.now();
  const interfaceSurface = input.interfaceSurface ?? (input.resolver === undefined ? "application" : "test-harness");
  const envelope: RuntimeApprovalEnvelope = {
    approvalId: input.approvalId,
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    source: input.source,
    reason: input.reason,
    requestedScopes: input.requestedScopes,
    riskLevel: input.riskLevel,
    interfaceSurface,
    metadata: input.metadata ?? {},
    publicSafe: true,
  };
  await input.store.appendApproval({
    sessionId: input.sessionId,
    approvalId: input.approvalId,
    status: "pending",
    reason: input.reason,
    requestedScopes: input.requestedScopes,
    riskLevel: input.riskLevel,
    source: input.source,
    interfaceSurface,
    createdAt,
    metadata: input.metadata ?? {},
  });
  await input.store.appendEvent(event(input.sessionId, `event:approval:${input.approvalId}:pending`, "runtime.approval.pending", createdAt, {
    approval: envelope,
  }));

  if (input.resolver === undefined) {
    return { status: "pending", envelope, events: ["runtime.approval.pending"], reason: input.reason };
  }

  let resolution: RuntimeApprovalResolution;
  try {
    resolution = await input.resolver(envelope);
  } catch {
    const resolvedAt = input.now();
    await input.store.resolveApproval(input.sessionId, input.approvalId, {
      status: "denied",
      resolvedAt,
      resolution: {
        resolvedBy: "approvalResolver",
        reason: "approval resolver failed",
      },
    });
    await input.store.appendEvent(event(input.sessionId, `event:approval:${input.approvalId}:resolverFailed`, "runtime.approval.denied", resolvedAt, {
      approvalId: input.approvalId,
      status: "denied",
      publicSafeFailure: "approval resolver failed",
    }));
    return {
      status: "denied",
      envelope,
      events: ["runtime.approval.denied"],
      reason: "approval resolver failed",
    };
  }
  const status = resolution.status;
  if (status === "pending") {
    return { status, envelope, events: ["runtime.approval.pending"], reason: resolution.reason ?? input.reason };
  }

  const resolvedAt = input.now();
  await input.store.resolveApproval(input.sessionId, input.approvalId, {
    status: status === "approved" ? "approved" : "denied",
    resolvedAt,
    resolution: {
      resolvedBy: resolution.resolvedBy ?? "approvalResolver",
      reason: resolution.reason,
      ...(resolution.metadata ?? {}),
    },
  });
  await input.store.appendEvent(event(input.sessionId, `event:approval:${input.approvalId}:resolved`, `runtime.approval.${status}`, resolvedAt, {
    approvalId: input.approvalId,
    status,
    resolvedBy: resolution.resolvedBy ?? "approvalResolver",
  }));
  return {
    status,
    envelope,
    events: [`runtime.approval.${status}`],
    reason: resolution.reason,
  };
}

async function buildPromptPackAndLower(input: {
  runtimeId: string;
  sessionId: string;
  manifest: AgentManifest;
  task: string;
  turnIndex: number;
  modelCaller: { kind: "application"; id: string; sessionId: string };
  toolMappings: readonly ProviderToolMapping[];
  observations: readonly RuntimeObservationMaterial[];
  events: readonly string[];
}): Promise<
  | {
      ok: true;
      promptPackId: string;
      promptPack: StandardPromptPack;
      loweredPrompt: LoweredPromptEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: PraxisRuntimeKernelError;
      events: readonly string[];
    }
> {
  const promptPackId = input.manifest.harness.promptPack.promptPackId ?? `${input.sessionId}:promptPack:${input.turnIndex + 1}`;
  const defined = definePromptPack({
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    targetModel: input.manifest.model.model,
    loweringHint: input.manifest.model.endpointShape,
    materials: promptMaterialsForTurn({
      manifest: input.manifest,
      task: input.task,
      turnIndex: input.turnIndex,
      toolMappings: input.toolMappings,
      observations: input.observations,
      events: input.events,
    }),
    requestedScopes: ["promptPack.define"],
    allowedScopes: ["promptPack.define"],
    runtimeReady: true,
    contract: { accepted: true },
    governance: { accepted: true },
  });
  if (!defined.ok) {
    return {
      ok: false,
      error: kernelError("PROMPT_PACK_FAILED", defined.error.message, "runtime-state"),
      events: defined.events,
    };
  }

  const assembled = assemblePromptPack({
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    targetModel: input.manifest.model.model,
    materials: defined.definition.materials,
    ordering: "priority-desc",
  });
  if (!assembled.ok) {
    return {
      ok: false,
      error: kernelError("PROMPT_PACK_FAILED", assembled.error.message, "runtime-state"),
      events: [...defined.events, ...assembled.events],
    };
  }

  const lowered = lowerPromptForModelAdapter({
    runtimeId: input.runtimeId,
    caller: input.modelCaller,
    promptPack: {
      id: promptPackId,
      materials: promptLoweringMaterials(assembled.promptPack),
      metadata: {
        source: "PraxisRuntimeKernel",
        format: assembled.promptPack.format,
      },
    },
    target: {
      capabilityId: "codex-responses",
      carrierId: input.manifest.model.carrierId,
      outputMode: "single",
    },
    runtimeReady: true,
    contract: { accepted: true },
    governance: { accepted: true },
  });
  if (!lowered.ok) {
    return {
      ok: false,
      error: kernelError("PROMPT_PACK_FAILED", lowered.error.message, "runtime-state"),
      events: [...defined.events, ...assembled.events, ...lowered.events],
    };
  }

  return {
    ok: true,
    promptPackId,
    promptPack: assembled.promptPack,
    loweredPrompt: lowered.loweredPrompt,
    events: [...defined.events, ...assembled.events, ...lowered.events],
  };
}

async function executeBaseToolDecision(input: {
  runtimeId: string;
  sessionId: string;
  manifest: AgentManifest;
  executor: BaseToolExecutorPort;
  toolCallId: string;
  toolId: string;
  providerToolName?: string;
  args: Readonly<Record<string, unknown>>;
  allowToolExecution?: boolean;
  dependencyRuntime?: NonNullable<PraxisRuntimeKernelOptions["baseToolDependencyRuntime"]>;
  store: RuntimeSessionStateEventStore;
  approvalResolver?: RuntimeApprovalResolver;
  now: () => string;
  events: string[];
}): Promise<{
  record: AgentToolCallRecord;
  observation: RuntimeObservationMaterial;
  events: readonly string[];
  governance: BaseToolRuntimeGovernanceDecision;
}> {
  const toolArguments = enrichToolArguments(input.manifest, input.args);
  const runtimeReadiness = evaluateBaseToolRuntimeReadiness({
    toolId: input.toolId,
    executor: input.executor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
  });
  const governance = evaluateBaseToolRuntimeGovernance({
    toolId: input.toolId,
    policyMatrix: input.manifest.toolPolicy,
    sandbox: input.manifest.sandbox,
    readiness: runtimeReadiness,
    catalogEntry: runtimeReadiness.entry,
    resourceLimits: input.manifest.sandbox.resourceLimits,
    metadata: {
      toolCallId: input.toolCallId,
      providerToolName: input.providerToolName ?? "",
    },
  });
  input.events.push(...governance.events);

  if (governance.status === "deny") {
    const record: AgentToolCallRecord = {
      callId: input.toolCallId,
      toolId: input.toolId,
      arguments: toolArguments,
      ok: false,
      error: {
        code: "GOVERNANCE_REJECTED",
        message: runtimeReadiness.decision === "blocked" ? runtimeReadiness.reason : `BaseTool ${input.toolId} was denied by runtime governance`,
        publicSafe: true,
      },
    };
    const observation = createObservationMaterial({
      observationId: `${input.sessionId}:observation:${input.toolCallId}`,
      source: "baseTool",
      status: "failed",
      title: `BaseTool ${input.toolId}`,
      summary: "tool invocation denied by runtime governance",
      refs: [input.toolCallId, input.toolId],
      payload: record.error,
      metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, governanceStatus: governance.status }),
    });
    return { record, observation, events: governance.events, governance };
  }

  if (governance.status === "requiresApproval") {
    const approval = await requestRuntimeApproval({
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      approvalId: `${input.toolCallId}:approval`,
      source: "baseTool",
      reason: governance.approvalReason ?? `BaseTool ${input.toolId} requires approval`,
      requestedScopes: ["tool.execute", `tool.${input.toolId}`],
      riskLevel: governance.risk,
      resolver: input.approvalResolver,
      store: input.store,
      now: input.now,
      metadata: {
        toolCallId: input.toolCallId,
        toolId: input.toolId,
        policyMatrixId: governance.policyMatrixId,
      },
    });
    input.events.push(...approval.events);
    if (approval.status !== "approved") {
      const error = {
        code: "APPROVAL_REQUIRED",
        message: approval.reason ?? governance.approvalReason ?? `BaseTool ${input.toolId} requires approval`,
        publicSafe: true,
      };
      const record: AgentToolCallRecord = {
        callId: input.toolCallId,
        toolId: input.toolId,
        arguments: toolArguments,
        ok: false,
        error,
      };
      const observation = createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.toolCallId}:approval`,
        source: "baseTool",
        status: "waitingApproval",
        title: `BaseTool ${input.toolId}`,
        summary: error.message,
        refs: [input.toolCallId, input.toolId, approval.envelope.approvalId],
        payload: approval.envelope,
        metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, governanceStatus: governance.status }),
      });
      return { record, observation, events: [...governance.events, ...approval.events], governance };
    }
  }

  const dependencyPreflight = await preflightBaseToolDependencies({
    executor: input.executor,
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
    readiness: runtimeReadiness,
    catalogEntry: runtimeReadiness.entry,
    probes: input.dependencyRuntime?.probes,
    context: {
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      invocationId: input.toolCallId,
      toolId: input.toolId,
      toolInput: toolArguments,
      governanceAccepted: true,
      allowedScopes: input.manifest.harness.policy.scopes,
      mode: input.dependencyRuntime?.mode ?? "observe",
      managedRoot: input.dependencyRuntime?.managedRoot,
      env: input.dependencyRuntime?.env,
      homeDir: input.dependencyRuntime?.homeDir,
      timeoutMs: input.dependencyRuntime?.timeoutMs,
    },
  });
  input.events.push(...dependencyPreflight.events);
  await input.store.appendEvent(event(input.sessionId, `event:tool:${input.toolCallId}:dependencies`, "runtime.baseTool.dependencies.preflight", input.now(), {
    toolId: input.toolId,
    dependencyPreflight,
  }));

  if (dependencyPreflight.decision === "requiresApproval") {
    const approval = await requestRuntimeApproval({
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      approvalId: `${input.toolCallId}:dependency-approval`,
      source: "runtime",
      reason: dependencyPreflight.reason,
      requestedScopes: [
        "dependency.prepare",
        ...dependencyPreflight.approvalRequiredDependencies.map((dependencyId) => `dependency.${dependencyId}`),
      ],
      riskLevel: "risky",
      resolver: input.approvalResolver,
      store: input.store,
      now: input.now,
      metadata: {
        toolCallId: input.toolCallId,
        toolId: input.toolId,
        dependencyStatus: dependencyPreflight.status,
        installableDependencies: dependencyPreflight.installableDependencies,
      },
    });
    input.events.push(...approval.events);
    if (approval.status !== "approved") {
      const error = {
        code: "DEPENDENCY_APPROVAL_REQUIRED",
        message: approval.reason ?? dependencyPreflight.reason,
        publicSafe: true,
      };
      const record: AgentToolCallRecord = {
        callId: input.toolCallId,
        toolId: input.toolId,
        arguments: toolArguments,
        ok: false,
        error,
      };
      const observation = createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.toolCallId}:dependency-approval`,
        source: "baseTool",
        status: "waitingApproval",
        title: `BaseTool ${input.toolId}`,
        summary: error.message,
        refs: [input.toolCallId, input.toolId, approval.envelope.approvalId],
        payload: approval.envelope,
        metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, dependencyStatus: dependencyPreflight.status }),
      });
      return { record, observation, events: [...governance.events, ...dependencyPreflight.events, ...approval.events], governance };
    }

    if ((input.dependencyRuntime?.mode ?? "observe") !== "autoInstallTrustedManaged") {
      const error = {
        code: "DEPENDENCY_PREPARE_PENDING",
        message: "dependency approval was granted, but automatic trusted managed installation is not enabled for this run",
        publicSafe: true,
      };
      const record: AgentToolCallRecord = {
        callId: input.toolCallId,
        toolId: input.toolId,
        arguments: toolArguments,
        ok: false,
        error,
      };
      const observation = createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.toolCallId}:dependency-prepare`,
        source: "baseTool",
        status: "waitingApproval",
        title: `BaseTool ${input.toolId}`,
        summary: error.message,
        refs: [input.toolCallId, input.toolId],
        payload: dependencyPreflight,
        metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, dependencyStatus: dependencyPreflight.status }),
      });
      return { record, observation, events: [...governance.events, ...dependencyPreflight.events, ...approval.events], governance };
    }
  }

  if (dependencyPreflight.decision === "blocked") {
    const record: AgentToolCallRecord = {
      callId: input.toolCallId,
      toolId: input.toolId,
      arguments: toolArguments,
      ok: false,
      error: {
        code: dependencyPreflight.status === "providerUnavailable" ? "PROVIDER_UNAVAILABLE" : "DEPENDENCY_UNAVAILABLE",
        message: dependencyPreflight.reason,
        publicSafe: true,
      },
    };
    const observation = createObservationMaterial({
      observationId: `${input.sessionId}:observation:${input.toolCallId}:dependency`,
      source: "baseTool",
      status: "failed",
      title: `BaseTool ${input.toolId}`,
      summary: dependencyPreflight.reason,
      refs: [input.toolCallId, input.toolId],
      payload: dependencyPreflight,
      metadata: metadataRecord({ toolCallId: input.toolCallId, toolId: input.toolId, dependencyStatus: dependencyPreflight.status }),
    });
    return { record, observation, events: [...governance.events, ...dependencyPreflight.events], governance };
  }

  const toolResult = await invokeMountedBaseTool({
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    toolId: input.toolId,
    toolCallId: input.toolCallId,
    input: toolArguments,
    executor: input.executor,
    runtimeReady: true,
    readinessMode: "observe",
    implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
    requestedScopes: ["tool.execute", `tool.${input.toolId}`],
    allowedScopes: input.manifest.harness.policy.scopes,
    governance: { accepted: input.allowToolExecution ?? input.manifest.harness.policy.allowToolExecution ?? true },
    contract: { accepted: true },
    metadata: {
      sandbox: governance.sandbox,
      governance: {
        status: governance.status,
        risk: governance.risk,
        policyProfile: governance.policyProfile,
        policyMatrixId: governance.policyMatrixId,
      },
      dependencyRuntime: {
        status: dependencyPreflight.status,
        decision: dependencyPreflight.decision,
        missingDependencies: dependencyPreflight.missingDependencies,
        installableDependencies: dependencyPreflight.installableDependencies,
      },
    },
  });
  input.events.push(...toolResult.events);
  const record: AgentToolCallRecord = {
    callId: input.toolCallId,
    toolId: input.toolId,
    arguments: toolArguments,
    ok: toolResult.ok && toolResult.toolResult.ok,
    output: toolResult.ok && toolResult.toolResult.ok ? toolResult.toolResult.output : undefined,
    error: toolResult.ok ? (toolResult.toolResult.ok ? undefined : toolResult.toolResult.error) : toolResult.error,
  };
  const observation = createObservationMaterial({
    observationId: `${input.sessionId}:observation:${input.toolCallId}`,
    source: "baseTool",
    status: record.ok ? "completed" : "failed",
    title: `BaseTool ${input.toolId}`,
    summary: record.ok ? "tool invocation completed" : "tool invocation failed",
    refs: [input.toolCallId, input.toolId],
    payload: record.ok ? record.output : record.error,
    metadata: metadataRecord({
      toolCallId: input.toolCallId,
      toolId: input.toolId,
      providerToolName: input.providerToolName ?? "",
      createdAt: input.now(),
    }),
  });
  return { record, observation, events: toolResult.events, governance };
}

async function executeEphemeralProcedure(input: {
  runtimeId: string;
  sessionId: string;
  manifest: AgentManifest;
  executor: BaseToolExecutorPort;
  plan: EphemeralProcedurePlan;
  allowToolExecution?: boolean;
  store: RuntimeSessionStateEventStore;
  approvalResolver?: RuntimeApprovalResolver;
  dependencyRuntime?: NonNullable<PraxisRuntimeKernelOptions["baseToolDependencyRuntime"]>;
  now: () => string;
  events: string[];
}): Promise<{
  ok: boolean;
  records: readonly AgentToolCallRecord[];
  observations: readonly RuntimeObservationMaterial[];
  error?: PraxisRuntimeKernelError;
}> {
  if (input.plan.approval.required) {
    const approval = await requestRuntimeApproval({
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      approvalId: `${input.plan.procedureId}:approval`,
      source: "ephemeralProcedure",
      reason: input.plan.approval.reason ?? `EphemeralProcedure ${input.plan.procedureId} requires approval`,
      requestedScopes: input.plan.requiredBaseTools.map((toolId) => `tool.${toolId}`),
      riskLevel: input.plan.riskLevel,
      resolver: input.approvalResolver,
      store: input.store,
      now: input.now,
      metadata: {
        procedureId: input.plan.procedureId,
        requiredBaseTools: input.plan.requiredBaseTools,
      },
    });
    input.events.push(...approval.events);
    if (approval.status === "approved") {
      // Approval was resolved by the application/test harness; execute the procedure below.
    } else {
    return {
      ok: false,
      records: [],
      observations: [createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.plan.procedureId}:approval`,
        source: "ephemeralProcedure",
        status: "waitingApproval",
        title: `EphemeralProcedure ${input.plan.procedureId}`,
        summary: approval.reason ?? input.plan.approval.reason ?? "procedure requires approval",
        refs: [input.plan.procedureId, approval.envelope.approvalId],
        payload: approval.envelope,
      })],
      error: kernelError("APPROVAL_REQUIRED", `procedure requires approval: ${input.plan.procedureId}`, "tool"),
    };
    }
  }

  const pending = new Map<string, EphemeralProcedureStep>(input.plan.steps.map((step) => [step.stepId, step]));
  const completed = new Set<string>();
  const records: AgentToolCallRecord[] = [];
  const observations: RuntimeObservationMaterial[] = [];

  while (pending.size > 0) {
    const ready = [...pending.values()].filter((step) => step.dependsOn.every((dependency) => completed.has(dependency)));
    if (ready.length === 0) {
      return {
        ok: false,
        records,
        observations,
        error: kernelError("PROCEDURE_INVOCATION_FAILED", `procedure has unresolved dependencies: ${input.plan.procedureId}`, "tool"),
      };
    }

    const wave = input.plan.executionMode === "serial" ? ready.slice(0, 1) : ready;
    const results = await Promise.all(wave.map((step) => executeBaseToolDecision({
      runtimeId: input.runtimeId,
      sessionId: input.sessionId,
      manifest: input.manifest,
      executor: input.executor,
      toolCallId: `${input.plan.procedureId}:${step.stepId}`,
      toolId: step.baseToolId,
      args: step.input,
      allowToolExecution: input.allowToolExecution,
      store: input.store,
      approvalResolver: input.approvalResolver,
      dependencyRuntime: input.dependencyRuntime,
      now: input.now,
      events: input.events,
    })));

    for (const [index, result] of results.entries()) {
      const step = wave[index];
      records.push(result.record);
      observations.push(createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.plan.procedureId}:${step.stepId}`,
        source: "ephemeralProcedure",
        status: result.record.ok ? "completed" : "failed",
        title: `EphemeralProcedure ${input.plan.procedureId} step ${step.stepId}`,
        summary: result.record.ok ? "procedure step completed" : "procedure step failed",
        refs: [input.plan.procedureId, step.stepId, result.record.callId],
        payload: result.record.ok ? result.record.output : result.record.error,
        metadata: metadataRecord({
          procedureId: input.plan.procedureId,
          stepId: step.stepId,
          baseToolId: step.baseToolId,
          outputRef: step.outputRef,
        }),
      }));
      pending.delete(step.stepId);
      if (!result.record.ok) {
        return {
          ok: false,
          records,
          observations,
          error: kernelError("PROCEDURE_INVOCATION_FAILED", `procedure step failed: ${step.stepId}`, "tool"),
        };
      }
      completed.add(step.stepId);
    }
  }

  return { ok: true, records, observations };
}

export class PraxisRuntimeKernel {
  readonly runtimeId?: string;
  readonly store: RuntimeSessionStateEventStore;

  constructor(options: { runtimeId?: string; store?: RuntimeSessionStateEventStore } = {}) {
    this.runtimeId = options.runtimeId;
    this.store = options.store ?? createInMemorySessionStateEventStore();
  }

  async run(agent: PraxisAgentInput<PraxisAgent>, task: string, options: PraxisRuntimeKernelOptions = {}): Promise<AgentRunResult> {
    const compiled = compileAgent(agent);
    if (!compiled.ok) {
      return {
        ok: false,
        error: kernelError("MANIFEST_COMPILE_FAILED", compiled.error.message, "compile"),
        events: compiled.events,
      };
    }
    return await this.runManifest(compiled.manifest, task, options);
  }

  async runManifest(manifest: AgentManifest, task: string, options: PraxisRuntimeKernelOptions = {}): Promise<AgentRunResult> {
    const runtimeId = options.runtimeId ?? this.runtimeId ?? runtimeIdFor(manifest);
    const sessionId = options.sessionId ?? sessionIdFor(runtimeId, manifest);
    const now = options.now ?? defaultNow;
    const store = options.store ?? this.store;
    const events: string[] = [];
    const modelCalls: AgentModelCallRecord[] = [];
    const toolCalls: AgentToolCallRecord[] = [];
    const mainLoopSteps: MainLoopStepRecord[] = [];
    const observations: RuntimeObservationMaterial[] = [];
    const createdAt = now();

    await store.createSession({
      sessionId,
      runtimeId,
      agentId: manifest.identity.id,
      manifestHash: manifest.manifestHash,
      createdAt,
      status: "running",
      metadata: { manifestId: manifest.manifestId },
    });
    await store.appendState(state(sessionId, "state:received", "received", now()));
    await store.appendEvent(event(sessionId, "event:session.created", "runtime.session.created", now(), {
      agentId: manifest.identity.id,
    }));

    const input = receiveTextInput({
      runtimeId,
      sessionId,
      source: "user",
      text: task,
      runtimeReady: true,
      requestedScopes: ["agent.invoke"],
      allowedScopes: ["agent.invoke"],
      governance: { accepted: true },
    });
    events.push(...input.events);
    if (!input.ok) {
      const error = kernelError("TEXT_INPUT_REJECTED", input.error.message, "io");
      await recordKernelError({ store, sessionId, errorId: "error:input", error, createdAt: now() });
      await store.updateSessionStatus(sessionId, "failed");
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: 0,
          stepIndex: 0,
          actionPrimitive: "receiveInput",
          status: "failed",
          inputRefs: ["runtime.input.text"],
          error: {
            code: input.error.code,
            message: input.error.message,
            boundary: "input",
            publicSafe: true,
          },
          now: now(),
        }),
      });
      const snapshot = await store.readSession(sessionId);
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error,
        mainLoopSteps,
        events,
        state: snapshot,
      };
    }
    await recordMainLoopStep({
      store,
      sessionId,
      createdAt: now(),
      events,
      mainLoopSteps,
      step: createMainLoopStepRecord({
        sessionId,
        turnIndex: 0,
        stepIndex: 0,
        actionPrimitive: "receiveInput",
        status: "completed",
        inputRefs: ["runtime.input.text"],
        outputRefs: ["runtime.input.normalized"],
        stateAfterRef: "state:received",
        now: now(),
      }),
    });

    const dryRun = options.dryRun !== false;
    const executor = options.executor ?? createRuntimeBaseToolExecutorPort({
      runtimeId,
      sessionId,
      policy: {
        workspaceRoot: manifest.harness.policy.workspaceRoot,
        allowedRoots: manifest.harness.policy.allowedRoots,
        allowShellExecution: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
        allowGitExecution: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
        allowProcessExecution: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
        allowFilesystemWrite: manifest.harness.policy.allowToolExecution ?? options.allowToolExecution,
        allowRipgrep: true,
        allowNetworkFetch: true,
        ...(options.baseToolPolicy ?? {}),
      },
      resourceLimits: options.baseToolResourceLimits,
      emitEvent: (runtimeEvent) => {
        events.push(runtimeEvent.type);
      },
    });

    const modelCaller = {
      kind: "application" as const,
      id: "praxis-runtime-kernel",
      sessionId,
    };

    let finalOutput = "";
    const maxModelTurns = manifest.harness.loop.maxModelTurns ?? 2;
    const maxToolCalls = manifest.harness.loop.maxToolCalls ?? 4;
    const toolMappings = providerToolMappings(manifest);

    for (let turn = 0; turn < maxModelTurns; turn += 1) {
      await store.appendState(state(sessionId, `state:model:${turn + 1}`, "model", now(), { turn }));
      const stepBase = turn * 10 + 1;
      const prompt = await buildPromptPackAndLower({
        runtimeId,
        sessionId,
        manifest,
        task: input.input.normalizedText,
        turnIndex: turn,
        modelCaller,
        toolMappings,
        observations,
        events,
      });
      events.push(...prompt.events);
      if (!prompt.ok) {
        await recordKernelError({ store, sessionId, errorId: `error:prompt:${turn + 1}`, error: prompt.error, createdAt: now() });
        await recordMainLoopStep({
          store,
          sessionId,
          createdAt: now(),
          events,
          mainLoopSteps,
          step: createMainLoopStepRecord({
            sessionId,
            turnIndex: turn,
            stepIndex: stepBase,
            actionPrimitive: "assemblePromptPack",
            status: "failed",
            inputRefs: ["runtime.input.normalized", ...observations.map((observation) => observation.observationId)],
            error: {
              code: prompt.error.code,
              message: prompt.error.message,
              boundary: "prompt",
              publicSafe: true,
            },
            now: now(),
          }),
        });
        await store.updateSessionStatus(sessionId, "failed");
        const snapshot = await store.readSession(sessionId);
        return {
          ok: false,
          runtimeId,
          sessionId,
          manifest,
          error: prompt.error,
          mainLoopSteps,
          events,
          state: snapshot,
        };
      }

      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: turn,
          stepIndex: stepBase,
          actionPrimitive: "assemblePromptPack",
          status: "completed",
          inputRefs: ["runtime.input.normalized", ...observations.map((observation) => observation.observationId)],
          outputRefs: prompt.promptPack.materials.map((material) => material.id),
          promptPackRef: prompt.promptPackId,
          observationRefs: observations.map((observation) => observation.observationId),
          now: now(),
          metadata: {
            materialCount: prompt.promptPack.materials.length,
            toolDeclarationCount: prompt.promptPack.toolPack.declarations.length,
          },
        }),
      });
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: turn,
          stepIndex: stepBase + 1,
          actionPrimitive: "lowerPrompt",
          status: "completed",
          inputRefs: [prompt.promptPackId],
          outputRefs: [prompt.loweredPrompt.loweringId],
          promptPackRef: prompt.promptPackId,
          loweredPromptRef: prompt.loweredPrompt.loweringId,
          now: now(),
          metadata: {
            materialRefs: prompt.loweredPrompt.materialRefs,
            targetCapability: prompt.loweredPrompt.target.capabilityId,
          },
        }),
      });

      const modelInvocationId = `${sessionId}:model:${turn + 1}`;
      const modelResult = await invokeModelThroughRuntime({
        runtimeId,
        invocationId: modelInvocationId,
        caller: modelCaller,
        loweredPrompt: prompt.loweredPrompt,
        capability: { capabilityId: "codex-responses", kind: "responses" },
        carrier: { carrierId: manifest.model.carrierId, provider: manifest.model.provider },
        mode: "single",
        dryRun,
        allowProviderCall: options.allowProviderCall ?? manifest.harness.policy.allowProviderCall ?? !dryRun,
        auth: options.auth,
        providerCaller: options.providerCaller,
        providerBody: buildCodexResponsesBodyFromPromptPack(manifest, prompt.promptPack, toolMappings),
        governance: { accepted: true },
        contract: { accepted: true },
        clientName: manifest.model.clientName,
        clientVersion: manifest.model.clientVersion,
      });
      events.push(...modelResult.events);
      modelCalls.push({
        invocationId: modelInvocationId,
        raw: modelResult.ok ? modelResult.raw : null,
        ok: modelResult.ok,
      });
      await store.appendInvocation(invocation(sessionId, modelInvocationId, "model", manifest.model.carrierId, modelResult.ok, now(), {
        turn,
        promptPackId: prompt.promptPackId,
        loweringId: prompt.loweredPrompt.loweringId,
      }));
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: turn,
          stepIndex: stepBase + 2,
          actionPrimitive: "invokeModel",
          status: modelResult.ok ? "completed" : "failed",
          inputRefs: [prompt.loweredPrompt.loweringId],
          outputRefs: [modelInvocationId],
          modelCallId: modelInvocationId,
          promptPackRef: prompt.promptPackId,
          loweredPromptRef: prompt.loweredPrompt.loweringId,
          error: modelResult.ok ? undefined : {
            code: modelResult.error.code,
            message: modelResult.error.message,
            boundary: "model",
            publicSafe: true,
          },
          now: now(),
          metadata: { turn },
        }),
      });
      await recordHandoffPlan({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        turnIndex: turn,
        startStepIndex: stepBase + 20,
        tickKind: "model-only",
        promptPackRef: prompt.promptPackId,
        loweredPromptRef: prompt.loweredPrompt.loweringId,
        modelCallId: modelInvocationId,
        inputRefs: [prompt.promptPackId, prompt.loweredPrompt.loweringId],
        outputRefs: [modelInvocationId],
      });

      if (!modelResult.ok) {
        const error = kernelError("MODEL_INVOCATION_FAILED", modelResult.error.message, "model");
        await recordKernelError({ store, sessionId, errorId: `error:model:${turn + 1}`, error, createdAt: now(), metadata: { modelInvocationId } });
        await store.updateSessionStatus(sessionId, "failed");
        const snapshot = await store.readSession(sessionId);
        return {
          ok: false,
          runtimeId,
          sessionId,
          manifest,
          error,
          mainLoopSteps,
          events,
          state: snapshot,
        };
      }

      if (modelResult.raw === null) {
        finalOutput = "PraxisRuntimeKernel dry-run completed.";
        break;
      }

      const decisionResult = interpretModelDecision({
        raw: modelResult.raw,
        sessionId,
        turnIndex: turn,
        providerToolMappings: toolMappings,
        providerRawRef: modelInvocationId,
      });
      events.push(...decisionResult.events);
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: turn,
          stepIndex: stepBase + 3,
          actionPrimitive: "interpretModelDecision",
          status: decisionResult.ok ? "completed" : "failed",
          inputRefs: [modelInvocationId],
          outputRefs: decisionResult.ok ? decisionResult.decisions.map((decision) => decision.decisionId) : [],
          modelCallId: modelInvocationId,
          promptPackRef: prompt.promptPackId,
          error: decisionResult.ok ? undefined : {
            code: decisionResult.error.code,
            message: decisionResult.error.message,
            boundary: "model",
            publicSafe: true,
          },
          now: now(),
          metadata: {
            decisionKinds: decisionResult.ok ? decisionResult.decisions.map((decision) => decision.kind) : [],
          },
        }),
      });
      if (!decisionResult.ok) {
        const error = kernelError("MODEL_DECISION_FAILED", decisionResult.error.message, "model");
        await recordKernelError({ store, sessionId, errorId: `error:modelDecision:${turn + 1}`, error, createdAt: now(), metadata: { modelInvocationId } });
        await store.updateSessionStatus(sessionId, "failed");
        const snapshot = await store.readSession(sessionId);
        return {
          ok: false,
          runtimeId,
          sessionId,
          manifest,
          error,
          mainLoopSteps,
          events,
          state: snapshot,
        };
      }

      let continueLoop = false;
      for (const [decisionIndex, decision] of decisionResult.decisions.entries()) {
        if (decision.kind === "finalOutput") {
          finalOutput = decision.finalOutput ?? "";
          continueLoop = false;
          break;
        }

        if (decision.kind === "continue") {
          continueLoop = true;
          continue;
        }

        if (decision.kind === "fail") {
          const error = kernelError("MODEL_DECISION_FAILED", decision.failure?.message ?? "model decision requested failure", "model");
          await recordMainLoopStep({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            step: createMainLoopStepRecord({
              sessionId,
              turnIndex: turn,
              stepIndex: stepBase + 4 + decisionIndex,
              actionPrimitive: "fail",
              status: "failed",
              inputRefs: [decision.decisionId],
              error: {
                code: decision.failure?.code ?? "MODEL_DECISION_FAILED",
                message: decision.failure?.message ?? "model decision requested failure",
                boundary: "model",
                publicSafe: true,
              },
              now: now(),
            }),
          });
          await recordKernelError({
            store,
            sessionId,
            errorId: `error:modelDecisionFail:${turn + 1}:${decisionIndex}`,
            error,
            createdAt: now(),
            metadata: {
              decisionId: decision.decisionId,
              providerRawRef: decision.metadata.providerRawRef,
            },
          });
          await store.updateSessionStatus(sessionId, "failed");
          const snapshot = await store.readSession(sessionId);
          return {
            ok: false,
            runtimeId,
            sessionId,
            manifest,
            error,
            mainLoopSteps,
            events,
            state: snapshot,
          };
        }

        if (decision.kind === "requestApproval") {
          const approval = await requestRuntimeApproval({
            runtimeId,
            sessionId,
            approvalId: `${decision.decisionId}:approval`,
            source: "model",
            reason: decision.approvalRequest?.reason ?? "model requested approval",
            requestedScopes: decision.approvalRequest?.requestedScopes ?? [],
            riskLevel: decision.approvalRequest?.riskLevel,
            resolver: options.approvalResolver,
            store,
            now,
            metadata: {
              decisionId: decision.decisionId,
              modelCallId: modelInvocationId,
            },
          });
          events.push(...approval.events);
          await recordHandoffPlan({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            turnIndex: turn,
            startStepIndex: stepBase + 30 + decisionIndex * 10,
            tickKind: "approval-wait",
            inputRefs: [decision.decisionId],
            outputRefs: [approval.envelope.approvalId],
          });
          await recordMainLoopStep({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            step: createMainLoopStepRecord({
              sessionId,
              turnIndex: turn,
              stepIndex: stepBase + 4 + decisionIndex,
              actionPrimitive: "requestApproval",
              status: "waitingApproval",
              inputRefs: [decision.decisionId],
              outputRefs: decision.approvalRequest?.requestedScopes ?? [],
              now: now(),
              metadata: {
                reason: decision.approvalRequest?.reason ?? "model requested approval",
                riskLevel: decision.approvalRequest?.riskLevel ?? "unknown",
                approvalId: approval.envelope.approvalId,
                approvalStatus: approval.status,
              },
            }),
          });
          if (approval.status === "approved") {
            continueLoop = true;
            continue;
          }
          const error = kernelError("APPROVAL_REQUIRED", decision.approvalRequest?.reason ?? "model requested approval", "tool");
          await recordKernelError({
            store,
            sessionId,
            errorId: `error:approval:${approval.envelope.approvalId}`,
            error,
            createdAt: now(),
            metadata: {
              approvalId: approval.envelope.approvalId,
              approvalStatus: approval.status,
              decisionId: decision.decisionId,
            },
          });
          await store.updateSessionStatus(sessionId, "waitingApproval");
          const snapshot = await store.readSession(sessionId);
          return {
            ok: false,
            runtimeId,
            sessionId,
            manifest,
            error,
            mainLoopSteps,
            events,
            state: snapshot,
          };
        }

        if (decision.kind === "toolCall" && decision.toolCall !== undefined) {
          if (toolCalls.length >= maxToolCalls) {
            continueLoop = false;
            break;
          }
          await recordHandoffPlan({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            turnIndex: turn,
            startStepIndex: stepBase + 40 + decisionIndex * 10,
            tickKind: "tool-call",
            toolCallId: decision.toolCall.callId,
            inputRefs: [decision.decisionId],
          });
          await store.appendState(state(sessionId, `state:tool:${decision.toolCall.callId}`, "tool", now(), {
            toolId: decision.toolCall.toolId,
            providerToolName: decision.toolCall.providerToolName,
          }));
          const executed = await executeBaseToolDecision({
            runtimeId,
            sessionId,
            manifest,
            executor,
            toolCallId: decision.toolCall.callId,
            toolId: decision.toolCall.toolId,
            providerToolName: decision.toolCall.providerToolName,
            args: decision.toolCall.arguments,
            allowToolExecution: options.allowToolExecution,
            store,
            approvalResolver: options.approvalResolver,
            dependencyRuntime: options.baseToolDependencyRuntime,
            now,
            events,
          });
          toolCalls.push(executed.record);
          observations.push(executed.observation);
          await store.appendInvocation(invocation(sessionId, executed.record.callId, "tool", executed.record.toolId, executed.record.ok, now(), {
            ok: executed.record.ok,
            decisionId: decision.decisionId,
          }));
          await recordMainLoopStep({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            step: createMainLoopStepRecord({
              sessionId,
              turnIndex: turn,
              stepIndex: stepBase + 4 + decisionIndex,
              actionPrimitive: "invokeBaseTool",
              status: executed.record.ok ? "completed" : (isRecord(executed.record.error) && executed.record.error.code === "APPROVAL_REQUIRED" ? "waitingApproval" : "failed"),
              inputRefs: [decision.decisionId],
              outputRefs: [executed.record.callId],
              toolCallId: executed.record.callId,
              observationRefs: [executed.observation.observationId],
              error: executed.record.ok ? undefined : {
                code: "TOOL_INVOCATION_FAILED",
                message: `tool invocation failed: ${executed.record.toolId}`,
                boundary: "tool",
                publicSafe: true,
              },
              now: now(),
              metadata: {
                toolId: executed.record.toolId,
                providerToolName: decision.toolCall.providerToolName ?? "",
              },
            }),
          });

          if (!executed.record.ok) {
            const approvalRequired = isRecord(executed.record.error) && executed.record.error.code === "APPROVAL_REQUIRED";
            const error = approvalRequired
              ? kernelError("APPROVAL_REQUIRED", `tool invocation requires approval: ${executed.record.toolId}`, "tool")
              : kernelError("TOOL_INVOCATION_FAILED", `tool invocation failed: ${executed.record.toolId}`, "tool");
            await recordKernelError({
              store,
              sessionId,
              errorId: `error:tool:${executed.record.callId}`,
              error,
              createdAt: now(),
              metadata: {
                toolCallId: executed.record.callId,
                toolId: executed.record.toolId,
                approvalRequired,
              },
            });
            await store.updateSessionStatus(sessionId, approvalRequired ? "waitingApproval" : "failed");
            const snapshot = await store.readSession(sessionId);
            return {
              ok: false,
              runtimeId,
              sessionId,
              manifest,
              error,
              mainLoopSteps,
              events,
              state: snapshot,
            };
          }
          continueLoop = true;
          continue;
        }

        if (decision.kind === "ephemeralProcedurePlan" && decision.ephemeralProcedurePlan !== undefined) {
          const procedureCreatedAt = now();
          await recordHandoffPlan({
            store,
            sessionId,
            createdAt: procedureCreatedAt,
            events,
            mainLoopSteps,
            turnIndex: turn,
            startStepIndex: stepBase + 50 + decisionIndex * 10,
            tickKind: "ephemeral-procedure",
            procedureId: decision.ephemeralProcedurePlan.procedureId,
            inputRefs: [decision.decisionId],
          });
          await store.appendProcedure({
            sessionId,
            procedureId: decision.ephemeralProcedurePlan.procedureId,
            status: decision.ephemeralProcedurePlan.approval.required ? "waitingApproval" : "running",
            createdAt: procedureCreatedAt,
            summary: {
              decisionId: decision.decisionId,
              executionMode: decision.ephemeralProcedurePlan.executionMode,
              requiredBaseTools: decision.ephemeralProcedurePlan.requiredBaseTools,
              riskLevel: decision.ephemeralProcedurePlan.riskLevel,
            },
          });
          await store.appendInvocation(invocation(sessionId, decision.ephemeralProcedurePlan.procedureId, "procedure", decision.ephemeralProcedurePlan.purpose, true, now(), {
            decisionId: decision.decisionId,
            status: "planned",
          }));
          const procedureResult = await executeEphemeralProcedure({
            runtimeId,
            sessionId,
            manifest,
            executor,
            plan: decision.ephemeralProcedurePlan,
            allowToolExecution: options.allowToolExecution,
            store,
            approvalResolver: options.approvalResolver,
            dependencyRuntime: options.baseToolDependencyRuntime,
            now,
            events,
          });
          await store.appendProcedure({
            sessionId,
            procedureId: decision.ephemeralProcedurePlan.procedureId,
            status: procedureResult.ok ? "completed" : (procedureResult.error?.code === "APPROVAL_REQUIRED" ? "waitingApproval" : "failed"),
            createdAt: procedureCreatedAt,
            updatedAt: now(),
            summary: {
              decisionId: decision.decisionId,
              executionMode: decision.ephemeralProcedurePlan.executionMode,
              requiredBaseTools: decision.ephemeralProcedurePlan.requiredBaseTools,
              recordCount: procedureResult.records.length,
              observationCount: procedureResult.observations.length,
              errorCode: procedureResult.error?.code,
            },
          });
          toolCalls.push(...procedureResult.records);
          observations.push(...procedureResult.observations);
          for (const record of procedureResult.records) {
            await store.appendInvocation(invocation(sessionId, record.callId, "tool", record.toolId, record.ok, now(), {
              ok: record.ok,
              procedureId: decision.ephemeralProcedurePlan.procedureId,
              decisionId: decision.decisionId,
            }));
          }
          await recordMainLoopStep({
            store,
            sessionId,
            createdAt: now(),
            events,
            mainLoopSteps,
            step: createMainLoopStepRecord({
              sessionId,
              turnIndex: turn,
              stepIndex: stepBase + 4 + decisionIndex,
              actionPrimitive: "executeEphemeralProcedure",
              status: procedureResult.ok ? "completed" : (procedureResult.error?.code === "APPROVAL_REQUIRED" ? "waitingApproval" : "failed"),
              inputRefs: [decision.decisionId],
              outputRefs: procedureResult.records.map((record) => record.callId),
              procedureId: decision.ephemeralProcedurePlan.procedureId,
              observationRefs: procedureResult.observations.map((observation) => observation.observationId),
              error: procedureResult.ok || procedureResult.error === undefined ? undefined : {
                code: procedureResult.error.code,
                message: procedureResult.error.message,
                boundary: "procedure",
                publicSafe: true,
              },
              now: now(),
              metadata: {
                executionMode: decision.ephemeralProcedurePlan.executionMode,
                requiredBaseTools: decision.ephemeralProcedurePlan.requiredBaseTools,
              },
            }),
          });

          if (!procedureResult.ok) {
            const error = procedureResult.error ?? kernelError("PROCEDURE_INVOCATION_FAILED", "procedure invocation failed", "tool");
            await recordKernelError({
              store,
              sessionId,
              errorId: `error:procedure:${decision.ephemeralProcedurePlan.procedureId}`,
              error,
              createdAt: now(),
              metadata: {
                procedureId: decision.ephemeralProcedurePlan.procedureId,
                decisionId: decision.decisionId,
                approvalRequired: error.code === "APPROVAL_REQUIRED",
              },
            });
            await store.updateSessionStatus(sessionId, procedureResult.error?.code === "APPROVAL_REQUIRED" ? "waitingApproval" : "failed");
            const snapshot = await store.readSession(sessionId);
            return {
              ok: false,
              runtimeId,
              sessionId,
              manifest,
              error,
              mainLoopSteps,
              events,
              state: snapshot,
            };
          }
          continueLoop = true;
        }
      }

      if (!continueLoop) {
        break;
      }
    }

    if (!hasText(finalOutput)) {
      finalOutput = "PraxisRuntimeKernel completed without text output.";
    }

    const output = exposeTextOutput({
      outputId: `${sessionId}:output:final`,
      runtimeId,
      sessionId,
      source: "model",
      stage: "final",
      text: finalOutput,
      governance: { accepted: true },
      contract: { accepted: true },
    });
    events.push(...output.events);
    if (!output.ok) {
      const error = kernelError("TEXT_OUTPUT_REJECTED", output.error.message, "io");
      await store.updateSessionStatus(sessionId, "failed");
      await recordMainLoopStep({
        store,
        sessionId,
        createdAt: now(),
        events,
        mainLoopSteps,
        step: createMainLoopStepRecord({
          sessionId,
          turnIndex: maxModelTurns,
          stepIndex: maxModelTurns * 10 + 1,
          actionPrimitive: "exposeOutput",
          status: "failed",
          inputRefs: ["runtime.output.final"],
          error: {
            code: output.error.code,
            message: output.error.message,
            boundary: "output",
            publicSafe: true,
          },
          now: now(),
        }),
      });
      await recordKernelError({
        store,
        sessionId,
        errorId: "error:output:final",
        error,
        createdAt: now(),
        metadata: { outputId: `${sessionId}:output:final` },
      });
      const snapshot = await store.readSession(sessionId);
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error,
        mainLoopSteps,
        events,
        state: snapshot,
      };
    }
    await recordMainLoopStep({
      store,
      sessionId,
      createdAt: now(),
      events,
      mainLoopSteps,
      step: createMainLoopStepRecord({
        sessionId,
        turnIndex: maxModelTurns,
        stepIndex: maxModelTurns * 10 + 1,
        actionPrimitive: "exposeOutput",
        status: "completed",
        inputRefs: ["runtime.output.final"],
        outputRefs: [output.exposed.outputId],
        now: now(),
      }),
    });

    await store.appendEvent(event(sessionId, "event:output.final", "runtime.output.final", now(), {
      outputId: output.exposed.outputId,
    }));
    await store.appendState(state(sessionId, "state:completed", "completed", now()));
    await store.updateSessionStatus(sessionId, "completed");

    return {
      ok: true,
      runtimeId,
      sessionId,
      manifest,
      finalOutput,
      modelCalls,
      toolCalls,
      mainLoopSteps,
      events,
      state: await store.readSession(sessionId),
    };
  }
}

export function createPraxisRuntimeKernel(options: { runtimeId?: string; store?: RuntimeSessionStateEventStore } = {}): PraxisRuntimeKernel {
  return new PraxisRuntimeKernel(options);
}
