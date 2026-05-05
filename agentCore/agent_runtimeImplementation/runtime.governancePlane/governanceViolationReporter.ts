/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：报告治理违规或可疑越界行为。
 * 能力要求1：需要把违规信息送到检查面、调试面、管理面或自修复面。
 * 能力要求2：它不直接惩罚调用者，而是把违规变成 runtime 可处理事件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { GovernanceDecisionStatus } from "./governanceRuleEvaluator.js";
import type { RuntimeAuthorityContext } from "./runtimeAuthorityResolver.js";

export type GovernanceViolationSeverity = "info" | "warning" | "recoverable" | "critical";

export type GovernanceViolationRoute = "inspection" | "debug" | "management" | "self-repair";

export type GovernanceViolationBoundary = "input" | "governance" | "runtime-state";

export type GovernanceViolationReportErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_VIOLATION_CODE"
  | "MISSING_MESSAGE"
  | "RUNTIME_NOT_READY"
  | "GOVERNANCE_REJECTED";

export type GovernanceViolationGate = {
  accepted: boolean;
  reason?: string;
};

export type GovernanceViolation = {
  code: string;
  message: string;
  severity?: GovernanceViolationSeverity;
  decisionStatus?: GovernanceDecisionStatus;
  action?: string;
};

export type GovernanceViolationReportRequest = {
  runtimeId?: string;
  authority?: RuntimeAuthorityContext;
  violation?: GovernanceViolation;
  routes?: readonly GovernanceViolationRoute[];
  runtimeReady?: boolean;
  governance?: GovernanceViolationGate;
  correlationId?: string;
};

export type GovernanceViolationEvent = {
  type: "runtime.governance.violation";
  runtimeId: string;
  violationCode: string;
  message: string;
  severity: GovernanceViolationSeverity;
  decisionStatus?: GovernanceDecisionStatus;
  action?: string;
  callerId?: string;
  routes: readonly GovernanceViolationRoute[];
  correlationId?: string;
  punishCaller: false;
  unsafeSideEffects: false;
};

export type GovernanceViolationReportError = {
  code: GovernanceViolationReportErrorCode;
  message: string;
  boundary: GovernanceViolationBoundary;
  publicSafe: true;
};

export type GovernanceViolationReportResult =
  | {
      ok: true;
      event: GovernanceViolationEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: GovernanceViolationReportError;
      events: readonly string[];
    };

const defaultRoutes = ["inspection", "debug", "management"] as const satisfies readonly GovernanceViolationRoute[];

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanRoutes(values: readonly GovernanceViolationRoute[] | undefined): readonly GovernanceViolationRoute[] {
  return [...new Set(values ?? defaultRoutes)];
}

function failure(
  code: GovernanceViolationReportErrorCode,
  message: string,
  boundary: GovernanceViolationBoundary,
): GovernanceViolationReportResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.governance.violation.rejected"],
  };
}

export function reportGovernanceViolation(
  request?: GovernanceViolationReportRequest,
): GovernanceViolationReportResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "governance violation report requires a runtimeId", "input");
  }

  if (request.violation === undefined || isBlank(request.violation.code)) {
    return failure("MISSING_VIOLATION_CODE", "governance violation report requires a violation code", "input");
  }

  if (isBlank(request.violation.message)) {
    return failure("MISSING_MESSAGE", "governance violation report requires a public-safe message", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "governance violations can only be reported against a ready runtime", "runtime-state");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "governance violation reporting was rejected by governance",
      "governance",
    );
  }

  return {
    ok: true,
    event: {
      type: "runtime.governance.violation",
      runtimeId: (request.runtimeId ?? "").trim(),
      violationCode: request.violation.code.trim(),
      message: request.violation.message.trim(),
      severity: request.violation.severity ?? "warning",
      decisionStatus: request.violation.decisionStatus,
      action: request.violation.action?.trim() || undefined,
      callerId: request.authority?.caller.id,
      routes: cleanRoutes(request.routes),
      correlationId: request.correlationId?.trim() || undefined,
      punishCaller: false,
      unsafeSideEffects: false,
    },
    events: ["runtime.governance.violation.reported"],
  };
}
