/*
 * 文件定位：Agent 运行态实现层 / 自修复面。
 * 核心目的：承载 repair Action Gate 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeRepairPlan, RuntimeRepairPlanRisk, RuntimeRepairPlanStepKind } from "./repairPlanBuilder.js";

export type RuntimeRepairActionGateBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "approval";

export type RuntimeRepairActionGateErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_REPAIR_PLAN"
  | "MISSING_REPAIR_STEP"
  | "REPAIR_STEP_NOT_FOUND"
  | "REPAIR_SCOPE_DENIED"
  | "APPROVAL_REQUIRED"
  | "HIGH_RISK_REPAIR_DENIED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeRepairActionDecisionStatus = "allow" | "deny" | "requires-approval";

export type RuntimeRepairActionGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeRepairActionGateRequest = {
  runtimeId?: string;
  plan?: RuntimeRepairPlan;
  stepId?: string;
  allowedStepKinds?: readonly RuntimeRepairPlanStepKind[];
  approvedStepIds?: readonly string[];
  allowHighRisk?: boolean;
  runtimeReady?: boolean;
  contract?: RuntimeRepairActionGate;
  governance?: RuntimeRepairActionGate;
};

export type RuntimeRepairActionDecision = {
  status: RuntimeRepairActionDecisionStatus;
  runtimeId: string;
  planId: string;
  stepId: string;
  stepKind: RuntimeRepairPlanStepKind;
  risk: RuntimeRepairPlanRisk;
  reason: string;
  dryRunOnly: true;
  executionPlanned: false;
  approvalRequired: boolean;
  rollbackPoint: string;
  audit: {
    unsafeSideEffects: false;
    gate: "runtime.selfRepair.repairActionGate";
    contractChecked: true;
    governanceChecked: true;
  };
};

export type RuntimeRepairActionGateError = {
  code: RuntimeRepairActionGateErrorCode;
  message: string;
  boundary: RuntimeRepairActionGateBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeRepairActionGateResult =
  | {
      ok: true;
      decision: RuntimeRepairActionDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeRepairActionGateError;
      events: readonly string[];
    };

export const runtimeRepairActionGateDescriptor = {
  surface: "runtime.selfRepair",
  capability: "repairActionGate",
  purpose: "decide whether a dry-run self-repair step may proceed past runtime governance",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))] as unknown as readonly T[];
}

function failure(
  code: RuntimeRepairActionGateErrorCode,
  message: string,
  boundary: RuntimeRepairActionGateBoundary,
): RuntimeRepairActionGateResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.selfRepair.repairActionGate.rejected"],
  };
}

export function gateRuntimeRepairAction(
  request?: RuntimeRepairActionGateRequest,
): RuntimeRepairActionGateResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "repair action gate requires a runtimeId", "input");
  }

  if (request.plan === undefined) {
    return failure("MISSING_REPAIR_PLAN", "repair action gate requires a repair plan", "input");
  }

  if (!hasText(request.stepId)) {
    return failure("MISSING_REPAIR_STEP", "repair action gate requires a target repair stepId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "repair actions can only be gated through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "repair action gate was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "repair action gate was rejected by governance",
      "governance",
    );
  }

  const stepId = request.stepId.trim();
  const step = request.plan.steps.find((candidate) => candidate.stepId === stepId);
  if (step === undefined) {
    return failure("REPAIR_STEP_NOT_FOUND", `repair step ${stepId} was not found in the plan`, "input");
  }

  const allowedStepKinds = cleanList(request.allowedStepKinds);
  if (allowedStepKinds.length > 0 && !allowedStepKinds.includes(step.kind)) {
    return failure("REPAIR_SCOPE_DENIED", `repair step ${step.kind} is outside the allowed self-repair scope`, "scope");
  }

  if (request.plan.risk === "high" && request.allowHighRisk !== true) {
    return failure("HIGH_RISK_REPAIR_DENIED", "high-risk self-repair requires explicit runtime permission", "approval");
  }

  const approvedStepIds = cleanList(request.approvedStepIds);
  if (step.requiresApproval && !approvedStepIds.includes(step.stepId)) {
    return {
      ok: true,
      decision: {
        status: "requires-approval",
        runtimeId: request.runtimeId.trim(),
        planId: request.plan.planId,
        stepId: step.stepId,
        stepKind: step.kind,
        risk: request.plan.risk,
        reason: "repair step requires explicit approval before execution",
        dryRunOnly: true,
        executionPlanned: false,
        approvalRequired: true,
        rollbackPoint: step.rollbackPoint,
        audit: {
          unsafeSideEffects: false,
          gate: "runtime.selfRepair.repairActionGate",
          contractChecked: true,
          governanceChecked: true,
        },
      },
      events: ["runtime.selfRepair.repairActionGate.requires-approval"],
    };
  }

  return {
    ok: true,
    decision: {
      status: "allow",
      runtimeId: request.runtimeId.trim(),
      planId: request.plan.planId,
      stepId: step.stepId,
      stepKind: step.kind,
      risk: request.plan.risk,
      reason: "repair step passed dry-run gate checks",
      dryRunOnly: true,
      executionPlanned: false,
      approvalRequired: false,
      rollbackPoint: step.rollbackPoint,
      audit: {
        unsafeSideEffects: false,
        gate: "runtime.selfRepair.repairActionGate",
        contractChecked: true,
        governanceChecked: true,
      },
    },
    events: ["runtime.selfRepair.repairActionGate.allow"],
  };
}
