/*
 * 文件定位：Agent 运行态实现层 / 自修复面。
 * 核心目的：承载 repair Result Reporter 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeFaultClassification } from "./faultClassifier.js";
import type { RuntimeRepairPlan } from "./repairPlanBuilder.js";
import type { RuntimeRepairRollbackDecision } from "./repairRollbackGuard.js";
import type { RuntimeRepairSandboxRun } from "./repairSandboxRunner.js";

export type RuntimeRepairResultBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "report";

export type RuntimeRepairOutcome = "succeeded" | "failed" | "blocked" | "escalated" | "observe-only";

export type RuntimeRepairResultSeverity = "info" | "warning" | "error";

export type RuntimeRepairResultErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_OUTCOME"
  | "MISSING_FAULT_CONTEXT"
  | "MISSING_FAILURE_REASON"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeRepairResultGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeRepairResultReporterRequest = {
  runtimeId?: string;
  outcome?: RuntimeRepairOutcome;
  classification?: RuntimeFaultClassification;
  faultId?: string;
  plan?: RuntimeRepairPlan;
  sandboxRun?: RuntimeRepairSandboxRun;
  rollbackDecision?: RuntimeRepairRollbackDecision;
  failureReason?: string;
  recommendations?: readonly string[];
  reportedAt?: string;
  runtimeReady?: boolean;
  contract?: RuntimeRepairResultGate;
  governance?: RuntimeRepairResultGate;
};

export type RuntimeRepairResultReport = {
  reportId: string;
  runtimeId: string;
  outcome: RuntimeRepairOutcome;
  severity: RuntimeRepairResultSeverity;
  faultId: string;
  planId?: string;
  sandboxRunId?: string;
  rollbackPoint?: string;
  failureReason?: string;
  recommendations: readonly string[];
  reportedAt: string;
  publicSummary: string;
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    reporter: "runtime.selfRepair.repairResultReporter";
    notificationSent: false;
    contractChecked: true;
    governanceChecked: true;
  };
};

export type RuntimeRepairResultError = {
  code: RuntimeRepairResultErrorCode;
  message: string;
  boundary: RuntimeRepairResultBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeRepairResultReporterResult =
  | {
      ok: true;
      report: RuntimeRepairResultReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeRepairResultError;
      events: readonly string[];
    };

export const runtimeRepairResultReporterDescriptor = {
  surface: "runtime.selfRepair",
  capability: "repairResultReporter",
  purpose: "report self-repair outcomes, failure reasons, and recommended next steps",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeRepairResultErrorCode,
  message: string,
  boundary: RuntimeRepairResultBoundary,
): RuntimeRepairResultReporterResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.selfRepair.repairResultReporter.rejected"],
  };
}

function severityForOutcome(outcome: RuntimeRepairOutcome): RuntimeRepairResultSeverity {
  if (outcome === "failed" || outcome === "blocked") {
    return "error";
  }

  if (outcome === "escalated" || outcome === "observe-only") {
    return "warning";
  }

  return "info";
}

function defaultRecommendations(outcome: RuntimeRepairOutcome): readonly string[] {
  if (outcome === "succeeded") {
    return ["record repair evidence", "continue runtime observation"];
  }

  if (outcome === "failed") {
    return ["guard rollback point", "escalate if failure repeats"];
  }

  if (outcome === "blocked") {
    return ["inspect contract and governance rejection", "do not execute repair action"];
  }

  if (outcome === "escalated") {
    return ["wait for operator review", "preserve dry-run evidence"];
  }

  return ["keep observing fault signals", "avoid automatic repair"];
}

export function reportRepairResult(
  request?: RuntimeRepairResultReporterRequest,
): RuntimeRepairResultReporterResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "repair result reporter requires a runtimeId", "input");
  }

  if (request.outcome === undefined) {
    return failure("MISSING_OUTCOME", "repair result reporter requires an outcome", "input");
  }

  const faultId = request.classification?.faultId ?? request.faultId?.trim();
  if (!hasText(faultId)) {
    return failure("MISSING_FAULT_CONTEXT", "repair result reporter requires a faultId or classification", "input");
  }

  if (request.outcome === "failed" && !hasText(request.failureReason)) {
    return failure("MISSING_FAILURE_REASON", "failed repair reports require a public-safe failure reason", "report");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "repair results can only be reported through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "repair result reporting was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "repair result reporting was rejected by governance",
      "governance",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const recommendations = cleanList(request.recommendations);
  const finalRecommendations = recommendations.length > 0 ? recommendations : defaultRecommendations(request.outcome);
  const failureReason = request.failureReason?.trim();

  return {
    ok: true,
    report: {
      reportId: `${runtimeId}:repairResult:${faultId}:${request.outcome}`,
      runtimeId,
      outcome: request.outcome,
      severity: severityForOutcome(request.outcome),
      faultId,
      planId: request.plan?.planId,
      sandboxRunId: request.sandboxRun?.runId,
      rollbackPoint: request.rollbackDecision?.rollbackPoint ?? request.sandboxRun?.rollbackPoint,
      failureReason: hasText(failureReason) ? failureReason : undefined,
      recommendations: finalRecommendations,
      reportedAt: request.reportedAt?.trim() || "dry-run",
      publicSummary: `self-repair ${request.outcome} for fault ${faultId}`,
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        reporter: "runtime.selfRepair.repairResultReporter",
        notificationSent: false,
        contractChecked: true,
        governanceChecked: true,
      },
    },
    events: [`runtime.selfRepair.repairResultReporter.${request.outcome}`],
  };
}
