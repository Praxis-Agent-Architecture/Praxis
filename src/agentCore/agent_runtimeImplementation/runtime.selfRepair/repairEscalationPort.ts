/*
 * 文件定位：Agent 运行态实现层 / 自修复面。
 * 核心目的：承载 repair Escalation Port 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeFaultClassification } from "./faultClassifier.js";
import type { RuntimeRepairPlan } from "./repairPlanBuilder.js";

export type RuntimeRepairEscalationBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "escalation";

export type RuntimeRepairEscalationLevel = "operator-review" | "module-owner" | "governance-board";

export type RuntimeRepairEscalationReason =
  | "approval-required"
  | "high-risk"
  | "not-repairable"
  | "repeated-failure"
  | "governance-rejected";

export type RuntimeRepairEscalationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_FAULT_CLASSIFICATION"
  | "MISSING_ESCALATION_REASON"
  | "ESCALATION_SCOPE_DENIED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeRepairEscalationGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeRepairEscalationCaller = {
  kind: "application" | "official-module" | "runtime-surface" | "operator";
  id: string;
  moduleId?: string;
};

export type RuntimeRepairEscalationRequest = {
  runtimeId?: string;
  classification?: RuntimeFaultClassification;
  plan?: RuntimeRepairPlan;
  reason?: RuntimeRepairEscalationReason;
  caller?: RuntimeRepairEscalationCaller;
  targetLevel?: RuntimeRepairEscalationLevel;
  allowedLevels?: readonly RuntimeRepairEscalationLevel[];
  runtimeReady?: boolean;
  contract?: RuntimeRepairEscalationGate;
  governance?: RuntimeRepairEscalationGate;
};

export type RuntimeRepairEscalationEnvelope = {
  escalationId: string;
  runtimeId: string;
  faultId: string;
  planId?: string;
  reason: RuntimeRepairEscalationReason;
  targetLevel: RuntimeRepairEscalationLevel;
  caller?: RuntimeRepairEscalationCaller;
  summary: string;
  recommendedAction: "manual-review" | "approve-plan" | "reject-and-observe" | "open-governance-case";
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    port: "runtime.selfRepair.repairEscalationPort";
    notificationSent: false;
    contractChecked: true;
    governanceChecked: true;
  };
};

export type RuntimeRepairEscalationError = {
  code: RuntimeRepairEscalationErrorCode;
  message: string;
  boundary: RuntimeRepairEscalationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeRepairEscalationResult =
  | {
      ok: true;
      escalation: RuntimeRepairEscalationEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeRepairEscalationError;
      events: readonly string[];
    };

export const runtimeRepairEscalationPortDescriptor = {
  surface: "runtime.selfRepair",
  capability: "repairEscalationPort",
  purpose: "expose public-safe self-repair escalation envelopes without sending notifications",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanLevels(
  values: readonly RuntimeRepairEscalationLevel[] | undefined,
): readonly RuntimeRepairEscalationLevel[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))] as readonly RuntimeRepairEscalationLevel[];
}

function failure(
  code: RuntimeRepairEscalationErrorCode,
  message: string,
  boundary: RuntimeRepairEscalationBoundary,
): RuntimeRepairEscalationResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.selfRepair.repairEscalationPort.rejected"],
  };
}

function normalizeCaller(caller: RuntimeRepairEscalationCaller | undefined): RuntimeRepairEscalationCaller | undefined {
  if (caller === undefined || !hasText(caller.id)) {
    return undefined;
  }

  const normalized: RuntimeRepairEscalationCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  return normalized;
}

function defaultLevel(reason: RuntimeRepairEscalationReason): RuntimeRepairEscalationLevel {
  if (reason === "governance-rejected") {
    return "governance-board";
  }

  if (reason === "approval-required" || reason === "high-risk") {
    return "operator-review";
  }

  return "module-owner";
}

function recommendedAction(
  reason: RuntimeRepairEscalationReason,
): RuntimeRepairEscalationEnvelope["recommendedAction"] {
  if (reason === "approval-required") {
    return "approve-plan";
  }

  if (reason === "governance-rejected") {
    return "open-governance-case";
  }

  if (reason === "not-repairable") {
    return "reject-and-observe";
  }

  return "manual-review";
}

export function createRepairEscalation(
  request?: RuntimeRepairEscalationRequest,
): RuntimeRepairEscalationResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "repair escalation port requires a runtimeId", "input");
  }

  if (request.classification === undefined) {
    return failure("MISSING_FAULT_CLASSIFICATION", "repair escalation port requires a fault classification", "input");
  }

  if (request.reason === undefined) {
    return failure("MISSING_ESCALATION_REASON", "repair escalation port requires an escalation reason", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "repair escalation can only be exposed through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "repair escalation was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "repair escalation was rejected by governance",
      "governance",
    );
  }

  const targetLevel = request.targetLevel ?? defaultLevel(request.reason);
  const allowedLevels = cleanLevels(request.allowedLevels);
  if (allowedLevels.length > 0 && !allowedLevels.includes(targetLevel)) {
    return failure("ESCALATION_SCOPE_DENIED", `escalation level ${targetLevel} is outside the allowed runtime scope`, "scope");
  }

  const runtimeId = request.runtimeId.trim();
  const faultId = request.classification.faultId;
  const planId = request.plan?.planId;
  const escalationId = `${runtimeId}:repairEscalation:${faultId}:${request.reason}`;

  return {
    ok: true,
    escalation: {
      escalationId,
      runtimeId,
      faultId,
      planId,
      reason: request.reason,
      targetLevel,
      caller: normalizeCaller(request.caller),
      summary: `${request.reason} for ${request.classification.category} fault ${faultId}`,
      recommendedAction: recommendedAction(request.reason),
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        port: "runtime.selfRepair.repairEscalationPort",
        notificationSent: false,
        contractChecked: true,
        governanceChecked: true,
      },
    },
    events: [`runtime.selfRepair.repairEscalationPort.${targetLevel}`],
  };
}
