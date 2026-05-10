/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑。
 * 核心目的：把模型输出解释为 Praxis 内部 ModelDecision，而不是让 Kernel 直接猜 provider 形状。
 * 边界：保留 provider 原始引用，但不把 Responses 字段提升为 Praxis 核心合同。
 * 对接：mainLoop 根据决策调度 BaseTool、EphemeralProcedure、审批、继续或最终输出。
 * 实现提示：新增 provider shape 时只扩展 extractor，不改变 ModelDecision 主合同。
 */

import {
  normalizeEphemeralProcedurePlan,
  type EphemeralProcedurePlan,
} from "./ephemeralProcedure.js";
import {
  raiseProviderToolCalls,
  type ProviderToolNameMapping,
  type ProviderToolSchemaFamily,
} from "../../agent_modelAdapter/bridgingLayer/toolSchemaCompatibilityLayer.js";

export type ModelDecisionKind =
  | "finalOutput"
  | "toolCall"
  | "ephemeralProcedurePlan"
  | "requestApproval"
  | "continue"
  | "fail";

export type ModelDecisionToolCall = {
  callId: string;
  toolId: string;
  providerToolName?: string;
  arguments: Readonly<Record<string, unknown>>;
};

export type ModelDecisionToolContextExpansion = {
  targetKind: "family" | "group" | "tool";
  family?: string;
  group?: string;
  toolId?: string;
  reason?: string;
};

export type ModelDecisionFailure = {
  code: string;
  message: string;
  publicSafe: true;
};

export type ModelDecision = {
  decisionId: string;
  kind: ModelDecisionKind;
  finalOutput?: string;
  toolCall?: ModelDecisionToolCall;
  ephemeralProcedurePlan?: EphemeralProcedurePlan;
  toolContextExpansion?: ModelDecisionToolContextExpansion;
  approvalRequest?: {
    reason: string;
    requestedScopes: readonly string[];
    riskLevel?: string;
  };
  failure?: ModelDecisionFailure;
  providerRawRef?: string;
  observationRefs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type ProviderToolMapping = ProviderToolNameMapping;

export type ModelDecisionInterpretRequest = {
  raw: unknown;
  sessionId: string;
  turnIndex: number;
  providerToolMappings?: readonly ProviderToolMapping[];
  providerFamily?: ProviderToolSchemaFamily;
  providerRawRef?: string;
};

export type ModelDecisionInterpretResult =
  | { ok: true; decisions: readonly ModelDecision[]; events: readonly string[] }
  | {
      ok: false;
      error: {
        code: "MISSING_SESSION_ID" | "MISSING_RAW" | "INVALID_EPHEMERAL_PROCEDURE";
        message: string;
        publicSafe: true;
      };
      events: readonly string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readStreamDelta(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sseDataObjects(text: string): readonly unknown[] {
  const objects: unknown[] = [];
  for (const line of text.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (payload.length === 0 || payload === "[DONE]") continue;
    try {
      objects.push(JSON.parse(payload) as unknown);
    } catch {
      // Ignore non-JSON stream payloads.
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
      const delta = readStreamDelta(object.delta);
      if (delta !== undefined && (eventType === undefined || eventType.includes("output_text"))) {
        deltas.push(delta);
      }
      if (object.response !== undefined) {
        const text = extractText(object.response);
        if (text.length > 0) completed.push(text);
      }
    }
    return deltas.join("").trim() || completed.join("\n").trim() || raw.trim();
  }

  if (!isRecord(raw)) return "";
  const direct = readString(raw.output_text) ?? readString(raw.text);
  if (direct !== undefined) return direct;

  const output = raw.output;
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const itemText = readString(item.output_text) ?? readString(item.text);
    if (itemText !== undefined) chunks.push(itemText);
    if (Array.isArray(item.content)) {
      for (const block of item.content) {
        if (!isRecord(block)) continue;
        const blockText = readString(block.text) ?? readString(block.output_text);
        if (blockText !== undefined) chunks.push(blockText);
      }
    }
  }
  return chunks.join("\n").trim();
}

function failure(
  code: "MISSING_SESSION_ID" | "MISSING_RAW" | "INVALID_EPHEMERAL_PROCEDURE",
  message: string,
): ModelDecisionInterpretResult {
  return {
    ok: false,
    error: { code, message, publicSafe: true },
    events: ["agentCore.execution.modelDecision.rejected"],
  };
}

function readToolContextExpansion(value: Readonly<Record<string, unknown>>): ModelDecisionToolContextExpansion | undefined {
  const targetKind = readString(value.targetKind);
  if (targetKind !== "family" && targetKind !== "group" && targetKind !== "tool") return undefined;
  const family = readString(value.family);
  const group = readString(value.group);
  const toolId = readString(value.toolId);
  if (targetKind === "family" && family === undefined) return undefined;
  if (targetKind === "group" && (family === undefined || group === undefined)) return undefined;
  if (targetKind === "tool" && toolId === undefined) return undefined;
  return {
    targetKind,
    ...(family === undefined ? {} : { family }),
    ...(group === undefined ? {} : { group }),
    ...(toolId === undefined ? {} : { toolId }),
    ...(readString(value.reason) === undefined ? {} : { reason: readString(value.reason) }),
  };
}

export function interpretModelDecision(request: ModelDecisionInterpretRequest): ModelDecisionInterpretResult {
  const sessionId = request.sessionId.trim();
  if (sessionId.length === 0) {
    return failure("MISSING_SESSION_ID", "ModelDecision interpretation requires a sessionId");
  }
  if (request.raw === undefined || request.raw === null) {
    return failure("MISSING_RAW", "ModelDecision interpretation requires provider output");
  }

  const rawRef = request.providerRawRef ?? `${sessionId}:model:${request.turnIndex + 1}:raw`;
  if (request.raw instanceof Error) {
    return {
      ok: true,
      decisions: [{
        decisionId: `${sessionId}:turn:${request.turnIndex}:decision:provider-failure`,
        kind: "fail",
        failure: {
          code: "PROVIDER_FAILURE",
          message: request.raw.message || "model provider failed",
          publicSafe: true,
        },
        providerRawRef: rawRef,
        observationRefs: [],
        metadata: { providerRawRef: rawRef },
      }],
      events: ["agentCore.execution.modelDecision.fail"],
    };
  }

  if (isRecord(request.raw) && isRecord(request.raw.error)) {
    return {
      ok: true,
      decisions: [{
        decisionId: `${sessionId}:turn:${request.turnIndex}:decision:provider-error`,
        kind: "fail",
        failure: {
          code: readString(request.raw.error.code) ?? "PROVIDER_ERROR",
          message: readString(request.raw.error.message) ?? "model provider returned an error",
          publicSafe: true,
        },
        providerRawRef: rawRef,
        observationRefs: [],
        metadata: { providerRawRef: rawRef },
      }],
      events: ["agentCore.execution.modelDecision.fail"],
    };
  }

  const decisions: ModelDecision[] = [];
  const providerToolCalls = raiseProviderToolCalls({
    raw: request.raw,
    providerFamily: request.providerFamily,
    mappings: request.providerToolMappings,
    providerRawRef: rawRef,
  });

  for (const [index, call] of providerToolCalls.entries()) {
    if (call.malformedArguments !== undefined) {
      decisions.push({
        decisionId: `${sessionId}:turn:${request.turnIndex}:decision:${index + 1}`,
        kind: "fail",
        failure: {
          code: "MALFORMED_PROVIDER_TOOL_ARGUMENTS",
          message: call.malformedArguments,
          publicSafe: true,
        },
        providerRawRef: rawRef,
        observationRefs: [],
        metadata: { providerFunctionName: call.providerName, callId: call.callId, providerFamily: call.providerFamily },
      });
      continue;
    }

    if (call.providerName === "praxis_ephemeral_procedure") {
      const procedure = normalizeEphemeralProcedurePlan(call.arguments);
      if (!procedure.ok) {
        decisions.push({
          decisionId: `${sessionId}:turn:${request.turnIndex}:decision:${index + 1}`,
          kind: "fail",
          failure: {
            code: "INVALID_EPHEMERAL_PROCEDURE",
            message: procedure.error.message,
            publicSafe: true,
          },
          providerRawRef: rawRef,
          observationRefs: [],
          metadata: { providerFunctionName: call.providerName, callId: call.callId, providerFamily: call.providerFamily },
        });
        continue;
      }
      decisions.push({
        decisionId: `${sessionId}:turn:${request.turnIndex}:decision:${index + 1}`,
        kind: "ephemeralProcedurePlan",
        ephemeralProcedurePlan: procedure.plan,
        providerRawRef: rawRef,
        observationRefs: [],
        metadata: { providerFunctionName: call.providerName, callId: call.callId, providerFamily: call.providerFamily },
      });
      continue;
    }

    if (call.providerName === "praxis_request_approval") {
      decisions.push({
        decisionId: `${sessionId}:turn:${request.turnIndex}:decision:${index + 1}`,
        kind: "requestApproval",
        approvalRequest: {
          reason: readString(call.arguments.reason) ?? "model requested approval",
          requestedScopes: Array.isArray(call.arguments.requestedScopes)
            ? call.arguments.requestedScopes.map((scope) => String(scope))
            : [],
          riskLevel: readString(call.arguments.riskLevel),
        },
        providerRawRef: rawRef,
        observationRefs: [],
        metadata: { providerFunctionName: call.providerName, callId: call.callId, providerFamily: call.providerFamily },
      });
      continue;
    }

    if (call.providerName === "praxis_expand_tool_context") {
      const expansion = readToolContextExpansion(call.arguments);
      decisions.push({
        decisionId: `${sessionId}:turn:${request.turnIndex}:decision:${index + 1}`,
        kind: expansion === undefined ? "fail" : "continue",
        ...(expansion === undefined
          ? {
              failure: {
                code: "INVALID_TOOL_CONTEXT_EXPANSION",
                message: "praxis_expand_tool_context requires targetKind plus family/group/toolId matching the target kind",
                publicSafe: true as const,
              },
            }
          : { toolContextExpansion: expansion }),
        providerRawRef: rawRef,
        observationRefs: [],
        metadata: {
          providerFunctionName: call.providerName,
          callId: call.callId,
          providerFamily: call.providerFamily,
          runtimeDecision: "expandToolContext",
          ...(expansion === undefined ? {} : { toolContextExpansion: expansion }),
        },
      });
      continue;
    }

    decisions.push({
      decisionId: `${sessionId}:turn:${request.turnIndex}:decision:${index + 1}`,
      kind: "toolCall",
      toolCall: {
        callId: call.callId,
        providerToolName: call.providerName,
        toolId: call.toolId,
        arguments: call.arguments,
      },
      providerRawRef: rawRef,
      observationRefs: [],
      metadata: { providerFunctionName: call.providerName, providerFamily: call.providerFamily },
    });
  }

  if (decisions.length > 0) {
    return { ok: true, decisions, events: ["agentCore.execution.modelDecision.toolIntent"] };
  }

  const text = extractText(request.raw);
  if (text.length > 0) {
    return {
      ok: true,
      decisions: [{
        decisionId: `${sessionId}:turn:${request.turnIndex}:decision:final`,
        kind: "finalOutput",
        finalOutput: text,
        providerRawRef: rawRef,
        observationRefs: [],
        metadata: {},
      }],
      events: ["agentCore.execution.modelDecision.finalOutput"],
    };
  }

  return {
    ok: true,
    decisions: [{
      decisionId: `${sessionId}:turn:${request.turnIndex}:decision:continue`,
      kind: "continue",
      providerRawRef: rawRef,
      observationRefs: [],
      metadata: {},
    }],
    events: ["agentCore.execution.modelDecision.continue"],
  };
}
