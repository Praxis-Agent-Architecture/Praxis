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
  createRuntimeBaseToolExecutorPort,
  listRuntimeBaseToolImplementedPortPaths,
  type RuntimeBaseToolExecutorPolicy,
  type RuntimeBaseToolExecutorResourceLimits,
} from "./runtime.execEngine/baseToolExecutorPortFactory.js";
import { invokeMountedBaseTool } from "./runtime.execEngine/baseToolRuntimeMount.js";
import { invokeModelThroughRuntime } from "./runtime.modelAdapter/modelInvocationRuntime.js";
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
  | "MODEL_INVOCATION_FAILED"
  | "TOOL_INVOCATION_FAILED"
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
      events: readonly string[];
      state: RuntimeSessionSnapshot;
    }
  | {
      ok: false;
      runtimeId?: string;
      sessionId?: string;
      manifest?: AgentManifest;
      error: PraxisRuntimeKernelError;
      events: readonly string[];
      state?: RuntimeSessionSnapshot;
    };

type NormalizedToolCall = {
  callId: string;
  toolId: string;
  arguments: Readonly<Record<string, unknown>>;
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

function extractText(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
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

  return calls;
}

function buildCodexResponsesBody(
  manifest: AgentManifest,
  task: string,
  toolResults: readonly AgentToolCallRecord[] = [],
): Readonly<Record<string, unknown>> {
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
          text: "You are running inside PraxisRuntimeKernel v1. Use tool calls only when they are declared in the harness.",
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
    tools: manifest.harness.tools.map((tool) => ({
      type: "function",
      name: tool.toolId,
      description: tool.description ?? `Praxis baseTool ${tool.toolId}`,
      parameters: tool.inputSchema ?? { type: "object", additionalProperties: true },
    })),
  };
}

function kernelError(
  code: PraxisRuntimeKernelErrorCode,
  message: string,
  boundary: PraxisRuntimeKernelError["boundary"],
): PraxisRuntimeKernelError {
  return { code, message, boundary, publicSafe: true };
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
      const snapshot = await store.readSession(sessionId);
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error: kernelError("TEXT_INPUT_REJECTED", input.error.message, "io"),
        events,
        state: snapshot,
      };
    }

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
    let lastRaw: unknown = null;
    const maxModelTurns = manifest.harness.loop.maxModelTurns ?? 2;
    const maxToolCalls = manifest.harness.loop.maxToolCalls ?? 4;

    for (let turn = 0; turn < maxModelTurns; turn += 1) {
      await store.appendState(state(sessionId, `state:model:${turn + 1}`, "model", now(), { turn }));
      const modelInvocationId = `${sessionId}:model:${turn + 1}`;
      const modelResult = await invokeModelThroughRuntime({
        runtimeId,
        invocationId: modelInvocationId,
        caller: modelCaller,
        loweredPrompt: {
          loweringId: `${sessionId}:lowering:${turn + 1}`,
          promptPackId: manifest.harness.promptPack.promptPackId ?? "runtime-shim",
          materialRefs: ["text-input", ...toolCalls.map((toolCall) => `tool:${toolCall.callId}`)],
        },
        capability: { capabilityId: "codex-responses", kind: "responses" },
        carrier: { carrierId: manifest.model.carrierId, provider: manifest.model.provider },
        mode: "single",
        dryRun,
        allowProviderCall: options.allowProviderCall ?? manifest.harness.policy.allowProviderCall ?? !dryRun,
        auth: options.auth,
        providerCaller: options.providerCaller,
        providerBody: buildCodexResponsesBody(manifest, input.input.normalizedText, toolCalls),
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
      }));

      if (!modelResult.ok) {
        await store.updateSessionStatus(sessionId, "failed");
        const snapshot = await store.readSession(sessionId);
        return {
          ok: false,
          runtimeId,
          sessionId,
          manifest,
          error: kernelError("MODEL_INVOCATION_FAILED", modelResult.error.message, "model"),
          events,
          state: snapshot,
        };
      }

      lastRaw = modelResult.raw;
      finalOutput = extractText(modelResult.raw);
      const requestedToolCalls = extractToolCalls(modelResult.raw);
      if (requestedToolCalls.length === 0 || toolCalls.length >= maxToolCalls) {
        break;
      }

      for (const requested of requestedToolCalls.slice(0, Math.max(0, maxToolCalls - toolCalls.length))) {
        await store.appendState(state(sessionId, `state:tool:${requested.callId}`, "tool", now(), {
          toolId: requested.toolId,
        }));
        const toolResult = await invokeMountedBaseTool({
          runtimeId,
          sessionId,
          toolId: requested.toolId,
          toolCallId: requested.callId,
          input: requested.arguments,
          executor,
          runtimeReady: true,
          readinessMode: "observe",
          implementedPortPaths: listRuntimeBaseToolImplementedPortPaths(),
          requestedScopes: ["tool.execute", `tool.${requested.toolId}`],
          allowedScopes: manifest.harness.policy.scopes,
          governance: { accepted: options.allowToolExecution ?? manifest.harness.policy.allowToolExecution ?? true },
          contract: { accepted: true },
        });
        events.push(...toolResult.events);
        const record: AgentToolCallRecord = {
          callId: requested.callId,
          toolId: requested.toolId,
          arguments: requested.arguments,
          ok: toolResult.ok && toolResult.toolResult.ok,
          output: toolResult.ok && toolResult.toolResult.ok ? toolResult.toolResult.output : undefined,
          error: toolResult.ok ? (toolResult.toolResult.ok ? undefined : toolResult.toolResult.error) : toolResult.error,
        };
        toolCalls.push(record);
        await store.appendInvocation(invocation(sessionId, requested.callId, "tool", requested.toolId, record.ok, now(), {
          ok: record.ok,
        }));

        if (!record.ok) {
          await store.updateSessionStatus(sessionId, "failed");
          const snapshot = await store.readSession(sessionId);
          return {
            ok: false,
            runtimeId,
            sessionId,
            manifest,
            error: kernelError("TOOL_INVOCATION_FAILED", `tool invocation failed: ${requested.toolId}`, "tool"),
            events,
            state: snapshot,
          };
        }
      }
    }

    if (!hasText(finalOutput)) {
      finalOutput = extractText(lastRaw) || "PraxisRuntimeKernel completed without text output.";
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
      const snapshot = await store.readSession(sessionId);
      return {
        ok: false,
        runtimeId,
        sessionId,
        manifest,
        error: kernelError("TEXT_OUTPUT_REJECTED", output.error.message, "io"),
        events,
        state: snapshot,
      };
    }

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
      events,
      state: await store.readSession(sessionId),
    };
  }
}

export function createPraxisRuntimeKernel(options: { runtimeId?: string; store?: RuntimeSessionStateEventStore } = {}): PraxisRuntimeKernel {
  return new PraxisRuntimeKernel(options);
}
