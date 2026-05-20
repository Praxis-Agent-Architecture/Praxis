/*
 * 文件定位：Agent 运行态实现层 / 运行管理面。
 * 核心目的：承载 runtime Rollback Controller 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeRollbackBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type RuntimeRollbackGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeRollbackTrace = {
  correlationId?: string;
  callerId?: string;
  operatorId?: string;
};

export type RuntimeRollbackCheckpoint = {
  checkpointId?: string;
  revision?: number;
  label?: string;
  createdBy?: string;
  trace?: RuntimeRollbackTrace;
};

export type RuntimeRollbackRequest = {
  runtimeId?: string;
  currentRevision?: number;
  targetCheckpoint?: RuntimeRollbackCheckpoint;
  reason?: string;
  allowedCheckpointIds?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeRollbackGate;
  governance?: RuntimeRollbackGate;
  trace?: RuntimeRollbackTrace;
};

export type RuntimeRollbackErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CURRENT_REVISION"
  | "MISSING_TARGET_CHECKPOINT"
  | "INVALID_CURRENT_REVISION"
  | "INVALID_TARGET_REVISION"
  | "CHECKPOINT_OUT_OF_SCOPE"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "ROLLBACK_NOT_REQUIRED"
  | "TARGET_AHEAD_OF_CURRENT";

export type RuntimeRollbackError = {
  code: RuntimeRollbackErrorCode;
  message: string;
  boundary: RuntimeRollbackBoundary;
  publicSafe: true;
  internalDetailExposed: false;
  stateSafe: true;
};

export type RuntimeRollbackPlan = {
  runtimeId: string;
  fromRevision: number;
  toRevision: number;
  checkpoint: {
    checkpointId: string;
    revision: number;
    label?: string;
    createdBy?: string;
  };
  reason?: string;
  controller: "runtime.managementPlane.rollbackController";
  dispatch: "dry-run";
  reversible: true;
  unsafeSideEffects: false;
  plannedSteps: readonly string[];
  audit: {
    kind: "runtime-rollback";
    requiresGovernance: true;
    contractChecked: boolean;
    governanceChecked: boolean;
  };
  trace: RuntimeRollbackTrace;
};

export type RuntimeRollbackResult =
  | {
      ok: true;
      plan: RuntimeRollbackPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeRollbackError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isValidRevision(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function cleanTrace(trace: RuntimeRollbackTrace | undefined): RuntimeRollbackTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
    operatorId: trace?.operatorId?.trim() || undefined,
  };
}

function cleanScope(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function createRuntimeRollbackError(
  code: RuntimeRollbackErrorCode,
  message: string,
  boundary: RuntimeRollbackBoundary,
): RuntimeRollbackError {
  return {
    code,
    message,
    boundary,
    publicSafe: true,
    internalDetailExposed: false,
    stateSafe: true,
  };
}

function failure(
  code: RuntimeRollbackErrorCode,
  message: string,
  boundary: RuntimeRollbackBoundary,
): RuntimeRollbackResult {
  return {
    ok: false,
    error: createRuntimeRollbackError(code, message, boundary),
    events: ["runtime.managementPlane.rollback.rejected"],
  };
}

export function planRuntimeRollback(request?: RuntimeRollbackRequest): RuntimeRollbackResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime rollback requires a runtimeId", "input");
  }

  if (request.currentRevision === undefined) {
    return failure("MISSING_CURRENT_REVISION", "runtime rollback requires the current runtime revision", "input");
  }

  if (!isValidRevision(request.currentRevision)) {
    return failure("INVALID_CURRENT_REVISION", "runtime rollback currentRevision must be a non-negative integer", "input");
  }

  if (request.targetCheckpoint === undefined || isBlank(request.targetCheckpoint.checkpointId)) {
    return failure("MISSING_TARGET_CHECKPOINT", "runtime rollback requires a target checkpoint id", "input");
  }

  if (!isValidRevision(request.targetCheckpoint.revision)) {
    return failure("INVALID_TARGET_REVISION", "runtime rollback target checkpoint revision must be a non-negative integer", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime rollback requires a ready runtime management plane", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime rollback was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime rollback was rejected by governance",
      "governance",
    );
  }

  const checkpointId = (request.targetCheckpoint.checkpointId ?? "").trim();
  const allowedCheckpointIds = cleanScope(request.allowedCheckpointIds);
  if (allowedCheckpointIds.length > 0 && !allowedCheckpointIds.includes(checkpointId)) {
    return failure(
      "CHECKPOINT_OUT_OF_SCOPE",
      "runtime rollback target checkpoint is outside the caller scope",
      "scope",
    );
  }

  const currentRevision = request.currentRevision;
  const targetRevision = request.targetCheckpoint.revision;
  if (targetRevision === currentRevision) {
    return failure("ROLLBACK_NOT_REQUIRED", "runtime rollback target already matches the current revision", "runtime-state");
  }

  if (targetRevision > currentRevision) {
    return failure("TARGET_AHEAD_OF_CURRENT", "runtime rollback target cannot be newer than current revision", "runtime-state");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const reason = request.reason?.trim() || undefined;

  return {
    ok: true,
    plan: {
      runtimeId,
      fromRevision: currentRevision,
      toRevision: targetRevision,
      checkpoint: {
        checkpointId,
        revision: targetRevision,
        label: request.targetCheckpoint.label?.trim() || undefined,
        createdBy: request.targetCheckpoint.createdBy?.trim() || undefined,
      },
      reason,
      controller: "runtime.managementPlane.rollbackController",
      dispatch: "dry-run",
      reversible: true,
      unsafeSideEffects: false,
      plannedSteps: [
        "validate-runtime",
        "validate-target-checkpoint",
        "check-contract-and-governance",
        "emit-rollback-audit-envelope",
      ],
      audit: {
        kind: "runtime-rollback",
        requiresGovernance: true,
        contractChecked: request.contract !== undefined,
        governanceChecked: request.governance !== undefined,
      },
      trace: cleanTrace(request.trace ?? request.targetCheckpoint.trace),
    },
    events: ["runtime.managementPlane.rollback.planned"],
  };
}
