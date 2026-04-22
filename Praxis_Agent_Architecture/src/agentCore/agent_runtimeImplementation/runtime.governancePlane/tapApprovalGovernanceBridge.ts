/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：把 runtime 治理和 TAP 的工具审批、授权、人工确认系统接起来。
 * 能力要求1：需要在工具调用或高风险动作前把审批需求交给 TAP。
 * 能力要求2：它不替代 TAP，而是让 TAP 成为 runtime 治理链上的正式审批能力。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  RuntimeGovernanceBoundary,
  RuntimeGovernanceCaller,
  RuntimeGovernanceDecision,
  RuntimeGovernanceGate,
} from "./runtimeGovernancePlane.js";

export type TapApprovalRiskLevel = "low" | "medium" | "high" | "critical";

export type TapApprovalTargetKind = "tool-call" | "high-risk-action" | "model-call" | "runtime-control";

export type TapApprovalGovernanceBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_ACTION"
  | "MISSING_CALLER"
  | "GOVERNANCE_DENIED"
  | "DECISION_RUNTIME_MISMATCH"
  | "APPROVAL_POLICY_REJECTED"
  | "TAP_NOT_MOUNTED";

export type TapApprovalGovernanceBridgeRequest = {
  runtimeId?: string;
  action?: string;
  targetKind?: TapApprovalTargetKind;
  caller?: RuntimeGovernanceCaller;
  governanceDecision?: RuntimeGovernanceDecision;
  riskLevel?: TapApprovalRiskLevel;
  tapMounted?: boolean;
  approvalChannel?: string;
  approvalPolicy?: RuntimeGovernanceGate;
  reason?: string;
};

export type TapApprovalEnvelope = {
  requestId: string;
  runtimeId: string;
  action: string;
  targetKind: TapApprovalTargetKind;
  requestedBy: RuntimeGovernanceCaller;
  reason: string;
  riskLevel: TapApprovalRiskLevel;
  approvalChannel: string;
  delegatedToTap: true;
  humanConfirmationRequired: boolean;
  dryRun: true;
  unsafeSideEffects: false;
};

export type TapApprovalGovernanceBridgePlan = {
  runtimeId: string;
  action: string;
  targetKind: TapApprovalTargetKind;
  approvalRequired: boolean;
  dispatch: "dry-run";
  tapCallPlanned: boolean;
  tapStrategyImplemented: false;
  approval?: TapApprovalEnvelope;
  unsafeSideEffects: false;
};

export type TapApprovalGovernanceBridgeError = {
  code: TapApprovalGovernanceBridgeErrorCode;
  message: string;
  boundary: RuntimeGovernanceBoundary;
  publicSafe: true;
};

export type TapApprovalGovernanceBridgeResult =
  | {
      ok: true;
      plan: TapApprovalGovernanceBridgePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: TapApprovalGovernanceBridgeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: TapApprovalGovernanceBridgeErrorCode,
  message: string,
  boundary: RuntimeGovernanceBoundary,
): TapApprovalGovernanceBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.governance.tapApproval.rejected"],
  };
}

function normalizeCaller(caller: RuntimeGovernanceCaller): RuntimeGovernanceCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
    sessionId: caller.sessionId?.trim() || undefined,
  };
}

function isApprovalRisk(riskLevel: TapApprovalRiskLevel): boolean {
  return riskLevel === "high" || riskLevel === "critical";
}

function buildApprovalEnvelope(
  request: TapApprovalGovernanceBridgeRequest,
  runtimeId: string,
  action: string,
  caller: RuntimeGovernanceCaller,
  targetKind: TapApprovalTargetKind,
  riskLevel: TapApprovalRiskLevel,
): TapApprovalEnvelope {
  const decision = request.governanceDecision;
  const approvalChannel = request.approvalChannel ?? decision?.approvalChannel ?? "tap.approval";
  const requestedBy = normalizeCaller(caller);

  return {
    requestId: `tap:${runtimeId}:${action}:${requestedBy.id}`,
    runtimeId,
    action,
    targetKind,
    requestedBy,
    reason: request.reason ?? decision?.reason ?? "runtime governance requires TAP approval before dispatch",
    riskLevel,
    approvalChannel,
    delegatedToTap: true,
    humanConfirmationRequired: riskLevel === "critical" || targetKind === "runtime-control",
    dryRun: true,
    unsafeSideEffects: false,
  };
}

export function createTapApprovalGovernanceBridge(
  request?: TapApprovalGovernanceBridgeRequest,
): TapApprovalGovernanceBridgeResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "TAP approval governance bridge requires a runtimeId", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  if (request.governanceDecision !== undefined && request.governanceDecision.runtimeId !== runtimeId) {
    return failure(
      "DECISION_RUNTIME_MISMATCH",
      "TAP approval bridge can only use a governance decision from the same runtime",
      "contract",
    );
  }

  if (request.governanceDecision?.status === "deny") {
    return failure(
      "GOVERNANCE_DENIED",
      request.governanceDecision.reason,
      "governance",
    );
  }

  const action = (request.action ?? request.governanceDecision?.action ?? "").trim();
  if (isBlank(action)) {
    return failure("MISSING_ACTION", "TAP approval governance bridge requires an action", "input");
  }

  const caller = request.caller ?? request.governanceDecision?.caller;
  if (caller === undefined || isBlank(caller.id)) {
    return failure("MISSING_CALLER", "TAP approval governance bridge requires a caller", "input");
  }

  if (request.approvalPolicy?.accepted === false) {
    return failure(
      "APPROVAL_POLICY_REJECTED",
      request.approvalPolicy.reason ?? "TAP approval policy rejected the bridge request",
      "contract",
    );
  }

  const riskLevel = request.riskLevel ?? "medium";
  const targetKind = request.targetKind ?? "tool-call";
  const approvalRequired = request.governanceDecision?.approvalRequired === true || isApprovalRisk(riskLevel);

  if (approvalRequired && request.tapMounted === false) {
    return failure("TAP_NOT_MOUNTED", "TAP must be mounted before runtime can delegate approval", "governance");
  }

  const approval =
    approvalRequired
      ? buildApprovalEnvelope(request, runtimeId, action, caller, targetKind, riskLevel)
      : undefined;

  return {
    ok: true,
    plan: {
      runtimeId,
      action,
      targetKind,
      approvalRequired,
      dispatch: "dry-run",
      tapCallPlanned: approvalRequired,
      tapStrategyImplemented: false,
      approval,
      unsafeSideEffects: false,
    },
    events: [
      approvalRequired
        ? "runtime.governance.tapApproval.planned"
        : "runtime.governance.tapApproval.notRequired",
    ],
  };
}
