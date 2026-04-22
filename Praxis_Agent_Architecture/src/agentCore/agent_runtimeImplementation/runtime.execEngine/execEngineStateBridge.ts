/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
 * 核心目的：承载 exec Engine State Bridge 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ExecEngineRuntimeCaller, ExecEngineRuntimeGate } from "./execEngineRuntime.js";

export type ExecEngineStateBridgeBoundary = "input" | "contract" | "governance" | "runtime-state" | "state";

export type ExecEngineStatePhase = "unbound" | "bound" | "ready" | "running" | "paused" | "failed";

export type ExecEngineStateBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_STATE"
  | "MISSING_STATE_ID"
  | "MISSING_PHASE"
  | "UNKNOWN_PHASE"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type ExecEngineStateBridgeError = {
  code: ExecEngineStateBridgeErrorCode;
  message: string;
  boundary: ExecEngineStateBridgeBoundary;
  publicSafe: true;
};

export type ExecEngineStateInput = {
  stateId?: string;
  phase?: ExecEngineStatePhase | string;
  cursor?: string;
  revision?: number;
  updatedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ExecEngineStateBridgeRequest = {
  runtimeId?: string;
  caller?: ExecEngineRuntimeCaller;
  state?: ExecEngineStateInput;
  runtimeReady?: boolean;
  contract?: ExecEngineRuntimeGate;
  governance?: ExecEngineRuntimeGate;
};

export type ExecEngineStateSnapshot = {
  bridgeId: string;
  runtimeId: string;
  caller: ExecEngineRuntimeCaller;
  stateId: string;
  phase: ExecEngineStatePhase;
  cursor?: string;
  revision: number;
  updatedAt?: string;
  metadata: Readonly<Record<string, unknown>>;
  route: "runtime.execEngine.stateBridge";
  readonly: true;
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ExecEngineStateBridgeResult =
  | {
      ok: true;
      snapshot: ExecEngineStateSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ExecEngineStateBridgeError;
      events: readonly string[];
    };

const knownStatePhases = new Set<ExecEngineStatePhase>(["unbound", "bound", "ready", "running", "paused", "failed"]);

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isExecEngineStatePhase(value: string): value is ExecEngineStatePhase {
  return knownStatePhases.has(value as ExecEngineStatePhase);
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
  code: ExecEngineStateBridgeErrorCode,
  message: string,
  boundary: ExecEngineStateBridgeBoundary,
): ExecEngineStateBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.execEngine.stateBridge.rejected"],
  };
}

export function bridgeExecEngineState(request?: ExecEngineStateBridgeRequest): ExecEngineStateBridgeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "execEngine state bridge requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "execEngine state bridge requires a caller", "input");
  }

  if (request.state === undefined) {
    return failure("MISSING_STATE", "execEngine state bridge requires a state input", "input");
  }

  if (!hasText(request.state.stateId)) {
    return failure("MISSING_STATE_ID", "execEngine state bridge requires a stateId", "input");
  }

  if (!hasText(request.state.phase)) {
    return failure("MISSING_PHASE", "execEngine state bridge requires a phase", "input");
  }

  const phase = request.state.phase.trim();
  if (!isExecEngineStatePhase(phase)) {
    return failure("UNKNOWN_PHASE", `execEngine state phase ${phase} is not recognized by this bridge`, "state");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "execEngine state bridge requires a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "execEngine state bridge was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "execEngine state bridge was rejected by governance",
      "governance",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const stateId = request.state.stateId.trim();

  return {
    ok: true,
    snapshot: {
      bridgeId: `${runtimeId}:state:${stateId}`,
      runtimeId,
      caller: normalizeCaller(request.caller),
      stateId,
      phase,
      cursor: request.state.cursor?.trim() || undefined,
      revision: request.state.revision ?? 0,
      updatedAt: request.state.updatedAt?.trim() || undefined,
      metadata: request.state.metadata ?? {},
      route: "runtime.execEngine.stateBridge",
      readonly: true,
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.execEngine.stateBridge.snapshotted"],
  };
}
