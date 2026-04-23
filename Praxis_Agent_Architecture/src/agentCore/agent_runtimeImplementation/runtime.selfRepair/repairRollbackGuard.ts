/*
 * 文件定位：Agent 运行态实现层 / 自修复面。
 * 核心目的：承载 repair Rollback Guard 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeRepairPlan, RuntimeRepairPlanRisk, RuntimeRepairPlanStepKind } from "./repairPlanBuilder.js";
import type { RuntimeRepairSandboxRun } from "./repairSandboxRunner.js";

export type RuntimeRepairRollbackBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "rollback";

export type RuntimeRepairRollbackStatus = "allow" | "deny" | "requires-approval";

export type RuntimeRepairRollbackTrigger =
  | "sandbox-failed"
  | "repair-failed"
  | "operator-request"
  | "governance-request"
  | "test";

export type RuntimeRepairRollbackErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPAIR_PLAN"
  | "MISSING_ROLLBACK_POINT"
  | "ROLLBACK_POINT_NOT_FOUND"
  | "ROLLBACK_SCOPE_DENIED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeRepairRollbackGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeRepairRollbackGuardRequest = {
  runtimeId?: string;
  plan?: RuntimeRepairPlan;
  rollbackPoint?: string;
  trigger?: RuntimeRepairRollbackTrigger;
  sandboxRun?: RuntimeRepairSandboxRun;
  allowedRollbackPoints?: readonly string[];
  approvedRollbackPoints?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeRepairRollbackGate;
  governance?: RuntimeRepairRollbackGate;
};

export type RuntimeRepairRollbackDecision = {
  status: RuntimeRepairRollbackStatus;
  runtimeId: string;
  planId: string;
  rollbackPoint: string;
  stepId?: string;
  stepKind?: RuntimeRepairPlanStepKind;
  risk: RuntimeRepairPlanRisk;
  trigger: RuntimeRepairRollbackTrigger;
  reason: string;
  rollbackPrepared: true;
  rollbackExecuted: false;
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    guard: "runtime.selfRepair.repairRollbackGuard";
    contractChecked: true;
    governanceChecked: true;
  };
};

export type RuntimeRepairRollbackError = {
  code: RuntimeRepairRollbackErrorCode;
  message: string;
  boundary: RuntimeRepairRollbackBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeRepairRollbackGuardResult =
  | {
      ok: true;
      decision: RuntimeRepairRollbackDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeRepairRollbackError;
      events: readonly string[];
    };

export const runtimeRepairRollbackGuardDescriptor = {
  surface: "runtime.selfRepair",
  capability: "repairRollbackGuard",
  purpose: "guard rollback points and conditions without executing rollback operations",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeRepairRollbackErrorCode,
  message: string,
  boundary: RuntimeRepairRollbackBoundary,
): RuntimeRepairRollbackGuardResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.selfRepair.repairRollbackGuard.rejected"],
  };
}

export function guardRepairRollback(request?: RuntimeRepairRollbackGuardRequest): RuntimeRepairRollbackGuardResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "repair rollback guard requires a runtimeId", "input");
  }

  if (request.plan === undefined) {
    return failure("MISSING_REPAIR_PLAN", "repair rollback guard requires a repair plan", "input");
  }

  const rollbackPoint = request.rollbackPoint?.trim() || request.sandboxRun?.rollbackPoint;
  if (!hasText(rollbackPoint)) {
    return failure("MISSING_ROLLBACK_POINT", "repair rollback guard requires a rollback point", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "repair rollback can only be guarded through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "repair rollback guard was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "repair rollback guard was rejected by governance",
      "governance",
    );
  }

  const knownRollbackPoints = cleanList(request.plan.rollbackPoints);
  if (!knownRollbackPoints.includes(rollbackPoint)) {
    return failure("ROLLBACK_POINT_NOT_FOUND", `rollback point ${rollbackPoint} is not declared by the repair plan`, "rollback");
  }

  const allowedRollbackPoints = cleanList(request.allowedRollbackPoints);
  if (allowedRollbackPoints.length > 0 && !allowedRollbackPoints.includes(rollbackPoint)) {
    return failure("ROLLBACK_SCOPE_DENIED", `rollback point ${rollbackPoint} is outside the allowed rollback scope`, "scope");
  }

  const step = request.plan.steps.find((candidate) => candidate.rollbackPoint === rollbackPoint);
  const approvedRollbackPoints = cleanList(request.approvedRollbackPoints);
  const requiresApproval = request.plan.risk === "high" || request.plan.approvalRequired;
  const status: RuntimeRepairRollbackStatus =
    requiresApproval && !approvedRollbackPoints.includes(rollbackPoint) ? "requires-approval" : "allow";
  const trigger = request.trigger ?? (request.sandboxRun === undefined ? "operator-request" : "sandbox-failed");

  return {
    ok: true,
    decision: {
      status,
      runtimeId: request.runtimeId.trim(),
      planId: request.plan.planId,
      rollbackPoint,
      stepId: step?.stepId,
      stepKind: step?.kind,
      risk: request.plan.risk,
      trigger,
      reason:
        status === "requires-approval"
          ? "rollback point is valid but requires explicit approval"
          : "rollback point passed dry-run guard checks",
      rollbackPrepared: true,
      rollbackExecuted: false,
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        guard: "runtime.selfRepair.repairRollbackGuard",
        contractChecked: true,
        governanceChecked: true,
      },
    },
    events: [`runtime.selfRepair.repairRollbackGuard.${status}`],
  };
}
