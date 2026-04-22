/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / TAP 复用转接层。
 * 核心目的：承载 TAP migrator from Base 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  TAPBaseToolCapabilityDescriptor,
  TAPGuardFromBaseResult,
  TAPTransferBoundary,
  TAPTransferGate,
  TAPTransferTrace,
} from "./TAP_guard_fromBase.js";

export type TAPMigratorFromBaseRequest = {
  transferId?: string;
  capability?: TAPBaseToolCapabilityDescriptor;
  tapNamespace?: string;
  targetCapabilityId?: string;
  guard?: TAPGuardFromBaseResult;
  contract?: TAPTransferGate;
  governance?: TAPTransferGate;
  dryRun?: boolean;
  trace?: TAPTransferTrace;
};

export type TAPMigratorFromBaseErrorCode =
  | "MISSING_TRANSFER_ID"
  | "MISSING_CAPABILITY"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_BASE_TOOL_NAME"
  | "GUARD_NOT_ALLOWED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "REAL_MIGRATION_BLOCKED";

export type TAPMigratorFromBaseError = {
  code: TAPMigratorFromBaseErrorCode;
  message: string;
  boundary: TAPTransferBoundary;
  publicSafe: true;
};

export type TAPReusableInvocationEnvelope = {
  mode: "dry-run";
  dryRun: true;
  baseToolExecutionPlanned: false;
  unsafeSideEffects: false;
};

export type TAPMigratedBaseCapability = {
  transferId: string;
  tapCapabilityId: string;
  tapNamespace: string;
  sourceCapabilityId: string;
  sourceBaseToolName: string;
  capabilityName?: string;
  description?: string;
  requestedScopes: readonly string[];
  requiredPermissions: readonly string[];
  observableState: NonNullable<TAPBaseToolCapabilityDescriptor["observableState"]>;
  invocationEnvelope: TAPReusableInvocationEnvelope;
  guardDecision: TAPGuardFromBaseResult["decision"] | "not-provided";
  trace: TAPTransferTrace;
};

export type TAPMigratorFromBaseResult =
  | {
      ok: true;
      migrated: TAPMigratedBaseCapability;
      events: readonly string[];
    }
  | {
      ok: false;
      error: TAPMigratorFromBaseError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanTrace(trace: TAPTransferTrace | undefined): TAPTransferTrace {
  return {
    correlationId: trace?.correlationId?.trim() || undefined,
    sessionId: trace?.sessionId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || undefined,
  };
}

function failure(
  code: TAPMigratorFromBaseErrorCode,
  message: string,
  boundary: TAPTransferBoundary,
): TAPMigratorFromBaseResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.basicToolLayer.tapReuseTransfer.migrator.rejected"],
  };
}

export function migrateBaseToolCapabilityToTAP(request?: TAPMigratorFromBaseRequest): TAPMigratorFromBaseResult {
  if (request === undefined || isBlank(request.transferId)) {
    return failure("MISSING_TRANSFER_ID", "TAP base capability migration requires a transferId", "input");
  }

  if (request.capability === undefined) {
    return failure("MISSING_CAPABILITY", "TAP base capability migration requires a capability descriptor", "input");
  }

  if (isBlank(request.capability.capabilityId)) {
    return failure("MISSING_CAPABILITY_ID", "TAP base capability migration requires a capabilityId", "input");
  }

  if (isBlank(request.capability.baseToolName)) {
    return failure("MISSING_BASE_TOOL_NAME", "TAP base capability migration requires a baseToolName", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "TAP base capability migration was rejected by contract",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "TAP base capability migration was rejected by governance",
      "governance",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_MIGRATION_BLOCKED",
      "TAP_migrator_fromBase only creates a dry-run reusable capability descriptor in the first implementation",
      "contract",
    );
  }

  if (request.guard !== undefined && (!request.guard.ok || request.guard.allowed !== true)) {
    return failure(
      "GUARD_NOT_ALLOWED",
      "TAP base capability migration requires an allowed guard result before handoff",
      request.guard.ok ? "governance" : request.guard.error.boundary,
    );
  }

  const transferId = (request.transferId ?? "").trim();
  const sourceCapabilityId = (request.capability.capabilityId ?? "").trim();
  const sourceBaseToolName = (request.capability.baseToolName ?? "").trim();
  const tapNamespace = request.tapNamespace?.trim() || "tap.reuseTransfer";
  const tapCapabilityId = request.targetCapabilityId?.trim() || `${tapNamespace}.${sourceBaseToolName}.${sourceCapabilityId}`;

  return {
    ok: true,
    migrated: {
      transferId,
      tapCapabilityId,
      tapNamespace,
      sourceCapabilityId,
      sourceBaseToolName,
      capabilityName: request.capability.capabilityName?.trim() || undefined,
      description: request.capability.description?.trim() || undefined,
      requestedScopes: cleanList(request.capability.requestedScopes),
      requiredPermissions: cleanList(request.capability.requiredPermissions),
      observableState: request.capability.observableState ?? "unknown",
      invocationEnvelope: {
        mode: "dry-run",
        dryRun: true,
        baseToolExecutionPlanned: false,
        unsafeSideEffects: false,
      },
      guardDecision: request.guard?.decision ?? "not-provided",
      trace: cleanTrace(request.trace),
    },
    events: ["agentCore.basicToolLayer.tapReuseTransfer.migrator.migrated"],
  };
}
