/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
 * 核心目的：承载 exec Engine Invocation Bridge 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ExecEngineRuntimeCaller, ExecEngineRuntimeGate } from "./execEngineRuntime.js";

export type ExecEngineInvocationBridgeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "bridge";

export type ExecEngineInvocationKind = "agent-step" | "tool" | "event" | "prompt-pack" | (string & {});

export type ExecEngineInvocationBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_INVOCATION"
  | "MISSING_INVOCATION_ID"
  | "MISSING_INVOCATION_KIND"
  | "MISSING_TARGET"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "UNSAFE_SIDE_EFFECT_REQUESTED";

export type ExecEngineInvocationBridgeError = {
  code: ExecEngineInvocationBridgeErrorCode;
  message: string;
  boundary: ExecEngineInvocationBridgeBoundary;
  publicSafe: true;
};

export type ExecEngineInvocationEnvelope = {
  invocationId?: string;
  kind?: ExecEngineInvocationKind;
  target?: string;
  payload?: unknown;
  dryRun?: boolean;
  auditRef?: string;
};

export type ExecEngineInvocationBridgeRequest = {
  runtimeId?: string;
  caller?: ExecEngineRuntimeCaller;
  invocation?: ExecEngineInvocationEnvelope;
  runtimeReady?: boolean;
  contract?: ExecEngineRuntimeGate;
  governance?: ExecEngineRuntimeGate;
};

export type ExecEngineInvocationPlan = {
  bridgeId: string;
  runtimeId: string;
  invocationId: string;
  caller: ExecEngineRuntimeCaller;
  kind: ExecEngineInvocationKind;
  target: string;
  payload?: unknown;
  route: "runtime.execEngine.invocationBridge";
  auditRef?: string;
  guard: "dry-run-envelope";
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ExecEngineInvocationBridgeResult =
  | {
      ok: true;
      plan: ExecEngineInvocationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ExecEngineInvocationBridgeError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCaller(caller: ExecEngineRuntimeCaller): ExecEngineRuntimeCaller {
  const normalized: ExecEngineRuntimeCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function failure(
  code: ExecEngineInvocationBridgeErrorCode,
  message: string,
  boundary: ExecEngineInvocationBridgeBoundary,
): ExecEngineInvocationBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.execEngine.invocationBridge.rejected"],
  };
}

export function bridgeExecEngineInvocation(
  request?: ExecEngineInvocationBridgeRequest,
): ExecEngineInvocationBridgeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "execEngine invocation bridge requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "execEngine invocation bridge requires a caller", "input");
  }

  if (request.invocation === undefined) {
    return failure("MISSING_INVOCATION", "execEngine invocation bridge requires an invocation envelope", "input");
  }

  if (!hasText(request.invocation.invocationId)) {
    return failure("MISSING_INVOCATION_ID", "execEngine invocation bridge requires an invocationId", "input");
  }

  if (!hasText(request.invocation.kind)) {
    return failure("MISSING_INVOCATION_KIND", "execEngine invocation bridge requires an invocation kind", "input");
  }

  if (!hasText(request.invocation.target)) {
    return failure("MISSING_TARGET", "execEngine invocation bridge requires a target", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "execEngine invocation bridge requires a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "execEngine invocation bridge was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "execEngine invocation bridge was rejected by governance",
      "governance",
    );
  }

  if (request.invocation.dryRun === false) {
    return failure(
      "UNSAFE_SIDE_EFFECT_REQUESTED",
      "execEngine invocation bridge only accepts dry-run envelopes in the first implementation",
      "bridge",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const invocationId = request.invocation.invocationId.trim();
  const kind = request.invocation.kind.trim();
  const target = request.invocation.target.trim();
  const auditRef = request.invocation.auditRef?.trim() || undefined;

  return {
    ok: true,
    plan: {
      bridgeId: `${runtimeId}:invocation:${invocationId}`,
      runtimeId,
      invocationId,
      caller: normalizeCaller(request.caller),
      kind,
      target,
      payload: request.invocation.payload,
      route: "runtime.execEngine.invocationBridge",
      auditRef,
      guard: "dry-run-envelope",
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.execEngine.invocationBridge.planned"],
  };
}
