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
import { invokeMountedBaseTool } from "./runtime.execEngine/baseToolRuntimeMount.js";
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
import {
  createInMemorySessionStateEventStore,
  type RuntimeEventRecord,
  type RuntimeInvocationRecord,
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
  now?: () => string;
};

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

type NormalizedToolCall = {
  callId: string;
  toolId: string;
  arguments: Readonly<Record<string, unknown>>;
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

function parseArguments(value: unknown): Readonly<Record<string, unknown>> {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function dedupeToolCalls(calls: readonly NormalizedToolCall[]): readonly NormalizedToolCall[] {
  const byCallId = new Map<string, NormalizedToolCall>();
  const order: string[] = [];
  for (const call of calls) {
    if (!byCallId.has(call.callId)) {
      order.push(call.callId);
    }
    byCallId.set(call.callId, call);
  }
  return order.map((callId) => byCallId.get(callId)).filter((call): call is NormalizedToolCall => call !== undefined);
}

function sseDataObjects(text: string): readonly unknown[] {
  const objects: unknown[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") {
      continue;
    }

    try {
      objects.push(JSON.parse(payload) as unknown);
    } catch {
      // Ignore provider keepalive or non-JSON SSE payloads.
    }
  }
  return objects;
}

function extractText(raw: unknown): string {
  if (typeof raw === "string") {
    const deltas: string[] = [];
    const completed: string[] = [];
    for (const object of sseDataObjects(raw)) {
      if (!isRecord(object)) continue;
      const eventType = readString(object.type);
      const delta = readString(object.delta);
      if (delta !== undefined && (eventType === undefined || eventType.includes("output_text"))) {
        deltas.push(delta);
      }
      if (object.response !== undefined) {
        const text = extractText(object.response);
        if (text.length > 0) {
          completed.push(text);
        }
      }
    }
    return deltas.join("").trim() || completed.join("\n").trim() || raw;
  }

  if (!isRecord(raw)) {
    return "";
  }

  const direct = readString(raw.output_text) ?? readString(raw.text);
  if (direct !== undefined) {
    return direct;
  }

  const output = raw.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const itemText = readString(item.output_text) ?? readString(item.text);
    if (itemText !== undefined) {
      chunks.push(itemText);
    }
    const content = item.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!isRecord(block)) continue;
        const blockText = readString(block.text) ?? readString(block.output_text);
        if (blockText !== undefined) chunks.push(blockText);
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractToolCalls(raw: unknown): readonly NormalizedToolCall[] {
  if (typeof raw === "string") {
    return dedupeToolCalls(sseDataObjects(raw).flatMap((object) => {
      if (!isRecord(object)) return [];
      const eventType = readString(object.type);
      const fromResponse = object.response === undefined ? [] : extractToolCalls(object.response);
      const fromItem = eventType === "response.output_item.done" && object.item !== undefined
        ? extractToolCalls({ output: [object.item] })
        : [];
      return [...fromResponse, ...fromItem];
    }));
  }

  if (!isRecord(raw)) {
    return [];
  }

  const candidates = [
    raw.tool_calls,
    raw.toolCalls,
    raw.output,
  ].filter(Array.isArray) as unknown[][];

  const calls: NormalizedToolCall[] = [];
  for (const list of candidates) {
    for (const item of list) {
      if (!isRecord(item)) continue;
      const functionRecord = isRecord(item.function) ? item.function : undefined;
      const type = readString(item.type);
      const name =
        readString(item.toolId) ??
        readString(item.name) ??
        readString(functionRecord?.name);
      if (name === undefined) continue;
      if (type !== undefined && !["function_call", "tool_call", "function"].includes(type) && item.toolId === undefined) {
        continue;
      }
      const callId = readString(item.call_id) ?? readString(item.id) ?? `${name}:${calls.length + 1}`;
      const args = item.arguments ?? functionRecord?.arguments ?? item.input ?? {};
      calls.push({
        callId,
        toolId: name,
        arguments: parseArguments(args),
      });
    }
  }

  return dedupeToolCalls(calls);
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

function runtimeToolIdFor(providerName: string, mappings: readonly ProviderToolMapping[]): string {
  return mappings.find((mapping) => mapping.providerName === providerName)?.toolId ?? providerName;
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

function buildCodexResponsesBody(
  manifest: AgentManifest,
  task: string,
  toolResults: readonly AgentToolCallRecord[] = [],
): Readonly<Record<string, unknown>> {
  const mappings = providerToolMappings(manifest);
  const toolMaterial = toolResults.length === 0
    ? ""
    : `\n\nTool results:\n${toolResults.map((result) => JSON.stringify(result)).join("\n")}`;

  return {
    model: manifest.model.model,
    input: [
      {
        role: "developer",
        content: [{
          type: "input_text",
          text: toolResults.length > 0
            ? "You are running inside PraxisRuntimeKernel v1. Tool results are already available. Do not call tools again; answer the user from the tool results."
            : "You are running inside PraxisRuntimeKernel v1. Use tool calls only when they are declared in the harness.",
        }],
      },
      {
        role: "user",
        content: [{
          type: "input_text",
          text: `${task}${toolMaterial}`,
        }],
      },
    ],
    ...(toolResults.length > 0
      ? {}
      : {
          tools: manifest.harness.tools.map((tool) => ({
            type: "function",
            name: mappings.find((mapping) => mapping.toolId === tool.toolId)?.providerName ?? providerToolName(tool.toolId),
            description: tool.description ?? `Praxis baseTool ${tool.toolId}`,
            parameters: tool.inputSchema ?? { type: "object", additionalProperties: true },
          })),
        }),
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
  await input.store.appendEvent(event(
    input.sessionId,
    `event:${input.step.stepId}`,
    "runtime.mainLoop.step",
    input.createdAt,
    { step: input.step },
  ));
}

function promptLoweringMaterials(promptPack: StandardPromptPack): readonly {
  kind: string;
  ref: string;
  text: string;
  priority: number;
  metadata: Readonly<Record<string, unknown>>;
}[] {
  return promptPack.materials.map((material) => ({
    kind: material.kind,
    ref: material.id,
    text: material.text,
    priority: material.priority,
    metadata: material.metadata,
  }));
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
  now: () => string;
  events: string[];
}): Promise<{
  record: AgentToolCallRecord;
  observation: RuntimeObservationMaterial;
  events: readonly string[];
}> {
  const toolArguments = enrichToolArguments(input.manifest, input.args);
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
  return { record, observation, events: toolResult.events };
}

async function executeEphemeralProcedure(input: {
  runtimeId: string;
  sessionId: string;
  manifest: AgentManifest;
  executor: BaseToolExecutorPort;
  plan: EphemeralProcedurePlan;
  allowToolExecution?: boolean;
  now: () => string;
  events: string[];
}): Promise<{
  ok: boolean;
  records: readonly AgentToolCallRecord[];
  observations: readonly RuntimeObservationMaterial[];
  error?: PraxisRuntimeKernelError;
}> {
  if (input.plan.approval.required) {
    return {
      ok: false,
      records: [],
      observations: [createObservationMaterial({
        observationId: `${input.sessionId}:observation:${input.plan.procedureId}:approval`,
        source: "ephemeralProcedure",
        status: "waitingApproval",
        title: `EphemeralProcedure ${input.plan.procedureId}`,
        summary: input.plan.approval.reason ?? "procedure requires approval",
        refs: [input.plan.procedureId],
        payload: { requiredBaseTools: input.plan.requiredBaseTools, riskLevel: input.plan.riskLevel },
      })],
      error: kernelError("APPROVAL_REQUIRED", `procedure requires approval: ${input.plan.procedureId}`, "tool"),
    };
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
        error: kernelError("TEXT_INPUT_REJECTED", input.error.message, "io"),
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

      if (!modelResult.ok) {
        await store.updateSessionStatus(sessionId, "failed");
        const snapshot = await store.readSession(sessionId);
        return {
          ok: false,
          runtimeId,
          sessionId,
          manifest,
          error: kernelError("MODEL_INVOCATION_FAILED", modelResult.error.message, "model"),
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
        await store.updateSessionStatus(sessionId, "failed");
        const snapshot = await store.readSession(sessionId);
        return {
          ok: false,
          runtimeId,
          sessionId,
          manifest,
          error: kernelError("MODEL_DECISION_FAILED", decisionResult.error.message, "model"),
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
          await store.updateSessionStatus(sessionId, "failed");
          const snapshot = await store.readSession(sessionId);
          return {
            ok: false,
            runtimeId,
            sessionId,
            manifest,
            error: kernelError("MODEL_DECISION_FAILED", decision.failure?.message ?? "model decision requested failure", "model"),
            mainLoopSteps,
            events,
            state: snapshot,
          };
        }

        if (decision.kind === "requestApproval") {
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
              },
            }),
          });
          await store.updateSessionStatus(sessionId, "failed");
          const snapshot = await store.readSession(sessionId);
          return {
            ok: false,
            runtimeId,
            sessionId,
            manifest,
            error: kernelError("APPROVAL_REQUIRED", decision.approvalRequest?.reason ?? "model requested approval", "tool"),
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
              status: executed.record.ok ? "completed" : "failed",
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
            await store.updateSessionStatus(sessionId, "failed");
            const snapshot = await store.readSession(sessionId);
            return {
              ok: false,
              runtimeId,
              sessionId,
              manifest,
              error: kernelError("TOOL_INVOCATION_FAILED", `tool invocation failed: ${executed.record.toolId}`, "tool"),
              mainLoopSteps,
              events,
              state: snapshot,
            };
          }
          continueLoop = true;
          continue;
        }

        if (decision.kind === "ephemeralProcedurePlan" && decision.ephemeralProcedurePlan !== undefined) {
          const procedureResult = await executeEphemeralProcedure({
            runtimeId,
            sessionId,
            manifest,
            executor,
            plan: decision.ephemeralProcedurePlan,
            allowToolExecution: options.allowToolExecution,
            now,
            events,
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
            await store.updateSessionStatus(sessionId, "failed");
            const snapshot = await store.readSession(sessionId);
            return {
              ok: false,
              runtimeId,
              sessionId,
              manifest,
              error: procedureResult.error ?? kernelError("PROCEDURE_INVOCATION_FAILED", "procedure invocation failed", "tool"),
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
      const snapshot = await store.readSession(sessionId);
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error: kernelError("TEXT_OUTPUT_REJECTED", output.error.message, "io"),
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
