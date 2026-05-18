/*
 * 文件定位：Agent 运行态实现层 / 调试面。
 * 核心目的：承载 debug Governance Probe 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type DebugGovernanceProbeBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type DebugGovernanceProbeCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug";

export type DebugGovernanceProbeCaller = {
  kind: DebugGovernanceProbeCallerKind;
  id: string;
  moduleId?: string;
};

export type DebugGovernanceProbeGate = {
  accepted: boolean;
  reason?: string;
};

export type DebugGovernanceDecisionStatus = "allow" | "deny" | "requires-approval" | "degrade";

export type DebugGovernanceDecisionSnapshot = {
  decisionId: string;
  action: string;
  status: DebugGovernanceDecisionStatus;
  reason?: string;
  policyId?: string;
  requiredScopes?: readonly string[];
  grantedScopes?: readonly string[];
};

export type DebugGovernanceProbeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "GOVERNANCE_DENIED";

export type DebugGovernanceProbeRequest = {
  runtimeId?: string;
  caller?: DebugGovernanceProbeCaller;
  runtimeReady?: boolean;
  contract?: DebugGovernanceProbeGate;
  governance?: DebugGovernanceProbeGate;
  decisions?: readonly DebugGovernanceDecisionSnapshot[];
  failOnDeny?: boolean;
};

export type DebugGovernanceProbeReport = {
  runtimeId: string;
  caller: DebugGovernanceProbeCaller;
  status: "clear" | "blocked" | "approval-needed" | "degraded";
  decisions: readonly DebugGovernanceDecisionSnapshot[];
  blockingDecisions: readonly DebugGovernanceDecisionSnapshot[];
  approvalDecisions: readonly DebugGovernanceDecisionSnapshot[];
  degradedDecisions: readonly DebugGovernanceDecisionSnapshot[];
  probeSurface: "runtime.debug.debugGovernanceProbe";
  contractChecked: true;
  governanceChecked: true;
  readonly: true;
  unsafeSideEffects: false;
};

export type DebugGovernanceProbeError = {
  code: DebugGovernanceProbeErrorCode;
  message: string;
  boundary: DebugGovernanceProbeBoundary;
  publicSafe: true;
};

export type DebugGovernanceProbeResult =
  | {
      ok: true;
      report: DebugGovernanceProbeReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DebugGovernanceProbeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: DebugGovernanceProbeCaller): DebugGovernanceProbeCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
  };
}

function normalizeDecision(decision: DebugGovernanceDecisionSnapshot): DebugGovernanceDecisionSnapshot {
  return {
    decisionId: decision.decisionId.trim(),
    action: decision.action.trim(),
    status: decision.status,
    reason: decision.reason?.trim() || undefined,
    policyId: decision.policyId?.trim() || undefined,
    requiredScopes: cleanList(decision.requiredScopes),
    grantedScopes: cleanList(decision.grantedScopes),
  };
}

function failure(
  code: DebugGovernanceProbeErrorCode,
  message: string,
  boundary: DebugGovernanceProbeBoundary,
): DebugGovernanceProbeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.debug.governanceProbe.rejected"],
  };
}

function reportStatus(
  blockingDecisions: readonly DebugGovernanceDecisionSnapshot[],
  approvalDecisions: readonly DebugGovernanceDecisionSnapshot[],
  degradedDecisions: readonly DebugGovernanceDecisionSnapshot[],
): DebugGovernanceProbeReport["status"] {
  if (blockingDecisions.length > 0) {
    return "blocked";
  }

  if (approvalDecisions.length > 0) {
    return "approval-needed";
  }

  if (degradedDecisions.length > 0) {
    return "degraded";
  }

  return "clear";
}

export function probeDebugGovernance(request: DebugGovernanceProbeRequest = {}): DebugGovernanceProbeResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "debug governance probe requires a runtimeId", "input");
  }

  if (request.caller === undefined || isBlank(request.caller.id)) {
    return failure("MISSING_CALLER", "debug governance probe requires a caller with a stable id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "debug governance probe can only inspect a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "debug governance probe was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "debug governance probe was rejected by governance",
      "governance",
    );
  }

  const decisions = (request.decisions ?? []).map(normalizeDecision);
  const blockingDecisions = decisions.filter((decision) => decision.status === "deny");

  if (request.failOnDeny === true && blockingDecisions.length > 0) {
    return failure(
      "GOVERNANCE_DENIED",
      `debug governance probe found denied runtime actions: ${blockingDecisions
        .map((decision) => decision.action)
        .join(", ")}`,
      "governance",
    );
  }

  const approvalDecisions = decisions.filter((decision) => decision.status === "requires-approval");
  const degradedDecisions = decisions.filter((decision) => decision.status === "degrade");
  const status = reportStatus(blockingDecisions, approvalDecisions, degradedDecisions);

  return {
    ok: true,
    report: {
      runtimeId: (request.runtimeId ?? "").trim(),
      caller: normalizeCaller(request.caller),
      status,
      decisions,
      blockingDecisions,
      approvalDecisions,
      degradedDecisions,
      probeSurface: "runtime.debug.debugGovernanceProbe",
      contractChecked: true,
      governanceChecked: true,
      readonly: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.debug.governanceProbe.${status}`],
  };
}
