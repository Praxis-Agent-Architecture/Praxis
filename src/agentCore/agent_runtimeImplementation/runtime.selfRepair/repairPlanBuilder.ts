/*
 * 文件定位：Agent 运行态实现层 / 自修复面。
 * 核心目的：承载 repair Plan Builder 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeFaultClassification, RuntimeFaultRepairability } from "./faultClassifier.js";

export type RuntimeRepairPlanBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "repair-plan";

export type RuntimeRepairPlanRisk = "low" | "medium" | "high";

export type RuntimeRepairPlanStepKind = "observe" | "restart-surface" | "reattach-module" | "fallback-adapter" | "escalate";

export type RuntimeRepairPlanErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_FAULT_CLASSIFICATION"
  | "FAULT_NOT_REPAIRABLE"
  | "REPAIR_SCOPE_DENIED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeRepairPlanGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeRepairStep = {
  stepId: string;
  kind: RuntimeRepairPlanStepKind;
  summary: string;
  dryRunOnly: true;
  requiresApproval: boolean;
  rollbackPoint: string;
  expectedEvent: string;
};

export type RuntimeRepairPlan = {
  planId: string;
  runtimeId: string;
  faultId: string;
  category: RuntimeFaultClassification["category"];
  repairability: RuntimeFaultRepairability;
  risk: RuntimeRepairPlanRisk;
  steps: readonly RuntimeRepairStep[];
  rollbackPoints: readonly string[];
  approvalRequired: boolean;
  escalationRequired: boolean;
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    generatedBy: "runtime.selfRepair.repairPlanBuilder";
    contractChecked: true;
    governanceChecked: true;
  };
};

export type RuntimeRepairPlanBuilderRequest = {
  runtimeId?: string;
  classification?: RuntimeFaultClassification;
  allowedStepKinds?: readonly RuntimeRepairPlanStepKind[];
  runtimeReady?: boolean;
  contract?: RuntimeRepairPlanGate;
  governance?: RuntimeRepairPlanGate;
  planId?: string;
};

export type RuntimeRepairPlanBuilderError = {
  code: RuntimeRepairPlanErrorCode;
  message: string;
  boundary: RuntimeRepairPlanBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeRepairPlanBuilderResult =
  | {
      ok: true;
      plan: RuntimeRepairPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeRepairPlanBuilderError;
      events: readonly string[];
    };

export const runtimeRepairPlanBuilderDescriptor = {
  surface: "runtime.selfRepair",
  capability: "repairPlanBuilder",
  purpose: "build dry-run self-repair plans with risk and rollback points",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanStepKinds(values: readonly RuntimeRepairPlanStepKind[] | undefined): readonly RuntimeRepairPlanStepKind[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))] as readonly RuntimeRepairPlanStepKind[];
}

function failure(
  code: RuntimeRepairPlanErrorCode,
  message: string,
  boundary: RuntimeRepairPlanBoundary,
): RuntimeRepairPlanBuilderResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.selfRepair.repairPlanBuilder.rejected"],
  };
}

function riskForClassification(classification: RuntimeFaultClassification): RuntimeRepairPlanRisk {
  if (classification.repairability === "requires-escalation" || classification.severity === "critical") {
    return "high";
  }

  if (classification.repairability === "requires-approval" || classification.severity === "degraded") {
    return "medium";
  }

  return "low";
}

function stepKindForClassification(classification: RuntimeFaultClassification): RuntimeRepairPlanStepKind {
  if (classification.repairability === "requires-escalation") {
    return "escalate";
  }

  if (classification.category === "module-attachment") {
    return "reattach-module";
  }

  if (classification.category === "provider-adapter") {
    return "fallback-adapter";
  }

  if (classification.category === "runtime-state" || classification.category === "execution") {
    return "restart-surface";
  }

  return "observe";
}

function buildStep(classification: RuntimeFaultClassification, planId: string): RuntimeRepairStep {
  const kind = stepKindForClassification(classification);
  const approvalRequired =
    classification.repairability === "requires-approval" || classification.repairability === "requires-escalation";

  return {
    stepId: `${planId}:step:1`,
    kind,
    summary: `${kind} for ${classification.category} fault ${classification.faultId}`,
    dryRunOnly: true,
    requiresApproval: approvalRequired,
    rollbackPoint: `${classification.faultId}:before:${kind}`,
    expectedEvent: `runtime.selfRepair.plan.step.${kind}`,
  };
}

export function buildRuntimeRepairPlan(
  request?: RuntimeRepairPlanBuilderRequest,
): RuntimeRepairPlanBuilderResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "repair plan builder requires a runtimeId", "input");
  }

  if (request.classification === undefined) {
    return failure("MISSING_FAULT_CLASSIFICATION", "repair plan builder requires a fault classification", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "repair plans can only be built through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "repair plan building was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "repair plan building was rejected by governance",
      "governance",
    );
  }

  if (request.classification.repairability === "not-repairable") {
    return failure("FAULT_NOT_REPAIRABLE", "fault classification is observe-only and cannot produce a repair plan", "repair-plan");
  }

  const runtimeId = request.runtimeId.trim();
  const planId = request.planId?.trim() || `${runtimeId}:repairPlan:${request.classification.faultId}`;
  const step = buildStep(request.classification, planId);
  const allowedStepKinds = cleanStepKinds(request.allowedStepKinds);

  if (allowedStepKinds.length > 0 && !allowedStepKinds.includes(step.kind)) {
    return failure("REPAIR_SCOPE_DENIED", `repair step ${step.kind} is outside the allowed self-repair scope`, "scope");
  }

  const risk = riskForClassification(request.classification);

  return {
    ok: true,
    plan: {
      planId,
      runtimeId,
      faultId: request.classification.faultId,
      category: request.classification.category,
      repairability: request.classification.repairability,
      risk,
      steps: [step],
      rollbackPoints: [step.rollbackPoint],
      approvalRequired: step.requiresApproval,
      escalationRequired: step.kind === "escalate",
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        generatedBy: "runtime.selfRepair.repairPlanBuilder",
        contractChecked: true,
        governanceChecked: true,
      },
    },
    events: [`runtime.selfRepair.repairPlanBuilder.${risk}`],
  };
}
