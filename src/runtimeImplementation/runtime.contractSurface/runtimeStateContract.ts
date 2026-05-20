/*
 * 文件定位：Agent 运行态实现层 / 运行契约面。
 * 核心目的：承载 runtime State Contract 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeContractBoundary, RuntimeContractCaller, RuntimeContractGate } from "./runtimePublicContract.js";

export type RuntimeStatePhase = "created" | "ready" | "invoking" | "streaming" | "paused" | "closed" | "failed";

export type RuntimeStateContractErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_STATE_PHASE"
  | "INVALID_STATE_PHASE"
  | "STALE_STATE_REVISION"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeStateContractError = {
  code: RuntimeStateContractErrorCode;
  message: string;
  boundary: RuntimeContractBoundary;
  stateSafe: true;
};

export type RuntimeStateContractRequest = {
  runtimeId?: string;
  phase?: RuntimeStatePhase | string;
  revision?: number;
  expectedRevision?: number;
  observedBy?: RuntimeContractCaller;
  contract?: RuntimeContractGate;
  governance?: RuntimeContractGate;
};

export type RuntimeStateSnapshotContract = {
  runtimeId: string;
  phase: RuntimeStatePhase;
  revision: number;
  observedBy?: RuntimeContractCaller;
  visibility: "contract-surface";
  mutable: false;
  unsafeSideEffects: false;
};

export type RuntimeStateContractResult =
  | {
      ok: true;
      state: RuntimeStateSnapshotContract;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeStateContractError;
      events: readonly string[];
    };

const allowedStatePhases = ["created", "ready", "invoking", "streaming", "paused", "closed", "failed"] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isRuntimeStatePhase(value: string): value is RuntimeStatePhase {
  return allowedStatePhases.includes(value as RuntimeStatePhase);
}

function failure(
  code: RuntimeStateContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
): RuntimeStateContractResult {
  return {
    ok: false,
    error: { code, message, boundary, stateSafe: true },
    events: ["runtime.stateContract.rejected"],
  };
}

export function defineRuntimeStateContract(request?: RuntimeStateContractRequest): RuntimeStateContractResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime state contract requires a runtimeId", "input");
  }

  if (isBlank(request.phase)) {
    return failure("MISSING_STATE_PHASE", "runtime state contract requires a state phase", "input");
  }

  const phase = (request.phase ?? "").trim();
  if (!isRuntimeStatePhase(phase)) {
    return failure("INVALID_STATE_PHASE", `runtime state phase ${phase} is not part of this contract`, "input");
  }

  const revision = request.revision ?? 0;
  if (request.expectedRevision !== undefined && request.expectedRevision !== revision) {
    return failure(
      "STALE_STATE_REVISION",
      `runtime state revision ${revision} does not match expected revision ${request.expectedRevision}`,
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime state contract was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime state contract was rejected by governance",
      "governance",
    );
  }

  return {
    ok: true,
    state: {
      runtimeId: (request.runtimeId ?? "").trim(),
      phase,
      revision,
      observedBy:
        request.observedBy === undefined
          ? undefined
          : {
              kind: request.observedBy.kind,
              id: request.observedBy.id.trim(),
            },
      visibility: "contract-surface",
      mutable: false,
      unsafeSideEffects: false,
    },
    events: ["runtime.stateContract.accepted"],
  };
}
