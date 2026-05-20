/*
 * 文件定位：Agent 运行态实现层 / 运行管理面。
 * 核心目的：承载 runtime Governance Bridge 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeAccessSession, RuntimeAccessSessionGate } from "./runtimeAccessSession.js";
import type { ManagementCommandEnvelope, ManagementPolicyDecision } from "./managementPolicyGate.js";

export type RuntimeGovernanceBridgeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "session"
  | "bridge";

export type RuntimeGovernanceBridgeErrorCode =
  | "MISSING_SESSION"
  | "MISSING_COMMAND"
  | "MISSING_POLICY_DECISION"
  | "RUNTIME_MISMATCH"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeGovernanceBridgeStatus = "ready" | "blocked" | "needs-approval" | "dry-run-only";

export type RuntimeGovernanceBridgeRequest = {
  session?: RuntimeAccessSession;
  command?: ManagementCommandEnvelope;
  policy?: ManagementPolicyDecision;
  targetGovernanceSurface?: string;
  runtimeReady?: boolean;
  contract?: RuntimeAccessSessionGate;
  governance?: RuntimeAccessSessionGate;
};

export type RuntimeGovernanceBridgeEnvelope = {
  runtimeId: string;
  commandId: string;
  action: string;
  sourceSurface: "runtime.managementPlane";
  targetGovernanceSurface: string;
  caller: {
    kind: RuntimeAccessSession["actor"]["kind"];
    id: string;
    moduleId?: string;
  };
  sessionId: string;
  requestedScopes: readonly string[];
  policyStatus: ManagementPolicyDecision["status"];
  bridgeStatus: RuntimeGovernanceBridgeStatus;
  governanceChecked: true;
  contractChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type RuntimeGovernanceBridgeError = {
  code: RuntimeGovernanceBridgeErrorCode;
  message: string;
  boundary: RuntimeGovernanceBridgeBoundary;
  safeForApplication: true;
  internalDetailExposed: false;
};

export type RuntimeGovernanceBridgeResult =
  | {
      ok: true;
      envelope: RuntimeGovernanceBridgeEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeGovernanceBridgeError;
      events: readonly string[];
    };

export const runtimeGovernanceBridgeDescriptor = {
  surface: "runtime.managementPlane",
  capability: "runtimeGovernanceBridge",
  purpose: "convert management-plane command decisions into dry-run governance-plane envelopes",
  mode: "dry-run",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: RuntimeGovernanceBridgeErrorCode,
  message: string,
  boundary: RuntimeGovernanceBridgeBoundary,
): RuntimeGovernanceBridgeResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForApplication: true,
      internalDetailExposed: false,
    },
    events: ["runtime.management.governanceBridge.rejected"],
  };
}

function bridgeStatusFromPolicy(policy: ManagementPolicyDecision): RuntimeGovernanceBridgeStatus {
  if (policy.status === "deny") {
    return "blocked";
  }

  if (policy.status === "requires-approval") {
    return "needs-approval";
  }

  if (policy.status === "dry-run-only") {
    return "dry-run-only";
  }

  return "ready";
}

export function createRuntimeGovernanceBridgeEnvelope(
  request: RuntimeGovernanceBridgeRequest = {},
): RuntimeGovernanceBridgeResult {
  if (request.session === undefined) {
    return failure("MISSING_SESSION", "runtime governance bridge requires a runtime access session", "session");
  }

  if (request.command === undefined) {
    return failure("MISSING_COMMAND", "runtime governance bridge requires a management command envelope", "input");
  }

  if (request.policy === undefined) {
    return failure(
      "MISSING_POLICY_DECISION",
      "runtime governance bridge requires a management policy decision before bridging",
      "governance",
    );
  }

  if (!isBlank(request.command.runtimeId) && request.command.runtimeId?.trim() !== request.session.runtimeId) {
    return failure("RUNTIME_MISMATCH", "management command runtimeId does not match the access session", "session");
  }

  if (request.policy.runtimeId !== request.session.runtimeId || request.policy.commandId !== request.command.commandId?.trim()) {
    return failure("RUNTIME_MISMATCH", "management policy decision does not match the command and session", "bridge");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime governance bridge requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the governance bridge",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the governance bridge",
      "governance",
    );
  }

  return {
    ok: true,
    envelope: {
      runtimeId: request.session.runtimeId,
      commandId: request.policy.commandId,
      action: `management.${request.policy.commandName}`,
      sourceSurface: "runtime.managementPlane",
      targetGovernanceSurface: request.targetGovernanceSurface?.trim() || "runtime.governancePlane",
      caller: {
        kind: request.session.actor.kind,
        id: request.session.actor.id,
        moduleId: request.session.actor.moduleId,
      },
      sessionId: request.session.sessionId,
      requestedScopes: request.policy.requiredScopes,
      policyStatus: request.policy.status,
      bridgeStatus: bridgeStatusFromPolicy(request.policy),
      governanceChecked: true,
      contractChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.management.governanceBridge.enveloped"],
  };
}
