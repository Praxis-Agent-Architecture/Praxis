/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / TAP 复用转接层。
 * 核心目的：承载 TAP status Detector 这一能力位点。
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
  TAPTransferTrace,
} from "./TAP_guard_fromBase.js";
import type { TAPInvokerFromBaseResult } from "./TAP_invoker_fromBase.js";
import type { TAPMigratorFromBaseResult } from "./TAP_migrator_fromBase.js";

export type TAPTransferDetectedStatus = "ready" | "pending-approval" | "blocked" | "degraded" | "unavailable" | "unknown";

export type TAPStatusDetectorRequest = {
  transferId?: string;
  capability?: TAPBaseToolCapabilityDescriptor;
  guard?: TAPGuardFromBaseResult;
  migration?: TAPMigratorFromBaseResult;
  invocation?: TAPInvokerFromBaseResult;
  runtimeReady?: boolean;
  expectedScopes?: readonly string[];
  observedScopes?: readonly string[];
  observedState?: TAPTransferDetectedStatus;
  trace?: TAPTransferTrace;
};

export type TAPStatusDetectorErrorCode = "MISSING_TRANSFER_ID" | "MISSING_CAPABILITY_ID";

export type TAPStatusDetectorError = {
  code: TAPStatusDetectorErrorCode;
  message: string;
  boundary: TAPTransferBoundary;
  publicSafe: true;
};

export type TAPTransferStatusReport = {
  transferId: string;
  capabilityId: string;
  baseToolName?: string;
  status: TAPTransferDetectedStatus;
  reasons: readonly string[];
  expectedScopes: readonly string[];
  observedScopes: readonly string[];
  missingScopes: readonly string[];
  trace: TAPTransferTrace;
  dryRun: true;
  unsafeSideEffects: false;
};

export type TAPStatusDetectorResult =
  | {
      ok: true;
      report: TAPTransferStatusReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: TAPStatusDetectorError;
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
  code: TAPStatusDetectorErrorCode,
  message: string,
  boundary: TAPTransferBoundary,
): TAPStatusDetectorResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.basicToolLayer.tapReuseTransfer.statusDetector.rejected"],
  };
}

function statusFromObservableState(
  observableState: TAPBaseToolCapabilityDescriptor["observableState"],
): TAPTransferDetectedStatus | undefined {
  if (observableState === "available") {
    return "ready";
  }

  if (observableState === "degraded" || observableState === "unavailable" || observableState === "unknown") {
    return observableState;
  }

  return undefined;
}

export function detectTAPTransferStatus(request?: TAPStatusDetectorRequest): TAPStatusDetectorResult {
  if (request === undefined || isBlank(request.transferId)) {
    return failure("MISSING_TRANSFER_ID", "TAP transfer status detector requires a transferId", "input");
  }

  if (isBlank(request.capability?.capabilityId)) {
    return failure("MISSING_CAPABILITY_ID", "TAP transfer status detector requires a capabilityId", "input");
  }

  const reasons: string[] = [];
  let status: TAPTransferDetectedStatus = request.observedState ?? "unknown";

  if (request.runtimeReady === false) {
    reasons.push("runtime is not ready");
    status = "unavailable";
  }

  if (request.guard !== undefined) {
    if (!request.guard.ok) {
      reasons.push(`guard rejected transfer: ${request.guard.error.code}`);
      status = "blocked";
    } else if (request.guard.decision === "pending-approval") {
      reasons.push("guard is waiting for approval");
      status = "pending-approval";
    } else if (request.guard.allowed === true && status === "unknown") {
      reasons.push("guard allowed transfer");
      status = "ready";
    }
  }

  if (request.migration !== undefined) {
    if (!request.migration.ok) {
      reasons.push(`migration failed: ${request.migration.error.code}`);
      status = "blocked";
    } else if (status === "unknown") {
      reasons.push("migration produced a reusable TAP descriptor");
      status = "ready";
    }
  }

  if (request.invocation !== undefined) {
    if (!request.invocation.ok) {
      reasons.push(`invocation envelope rejected: ${request.invocation.error.code}`);
      status = status === "blocked" ? "blocked" : "degraded";
    } else if (status === "unknown") {
      reasons.push("invocation envelope is available");
      status = "ready";
    }
  }

  const stateStatus = statusFromObservableState(request.capability?.observableState);
  if (stateStatus !== undefined && status !== "blocked" && status !== "pending-approval") {
    status = stateStatus;
    reasons.push(`base capability observable state is ${request.capability?.observableState}`);
  }

  const expectedScopes = cleanList(request.expectedScopes ?? request.capability?.requestedScopes);
  const observedScopes = cleanList(request.observedScopes);
  const missingScopes =
    expectedScopes.length === 0 || observedScopes.length === 0
      ? []
      : expectedScopes.filter((scope) => !observedScopes.includes(scope));

  if (missingScopes.length > 0 && status !== "blocked" && status !== "pending-approval") {
    reasons.push(`observed TAP handoff is missing scopes: ${missingScopes.join(", ")}`);
    status = "degraded";
  }

  if (reasons.length === 0) {
    reasons.push("no transfer signals were provided");
  }

  return {
    ok: true,
    report: {
      transferId: (request.transferId ?? "").trim(),
      capabilityId: (request.capability?.capabilityId ?? "").trim(),
      baseToolName: request.capability?.baseToolName?.trim() || undefined,
      status,
      reasons,
      expectedScopes,
      observedScopes,
      missingScopes,
      trace: cleanTrace(request.trace),
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["agentCore.basicToolLayer.tapReuseTransfer.statusDetector.detected"],
  };
}
