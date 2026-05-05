/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / TAP 复用转接层。
 * 核心目的：承载 TAP invoker from Base 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  TAPGuardFromBaseResult,
  TAPTransferBoundary,
  TAPTransferGate,
  TAPTransferTrace,
} from "./TAP_guard_fromBase.js";
import type { TAPMigratedBaseCapability } from "./TAP_migrator_fromBase.js";

export type TAPInvokerFromBaseRequest = {
  invocationId?: string;
  migratedCapability?: TAPMigratedBaseCapability;
  guard?: TAPGuardFromBaseResult;
  input?: unknown;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: TAPTransferGate;
  governance?: TAPTransferGate;
  dryRun?: boolean;
  trace?: TAPTransferTrace;
};

export type TAPInvokerFromBaseErrorCode =
  | "MISSING_INVOCATION_ID"
  | "MISSING_MIGRATED_CAPABILITY"
  | "MISSING_TAP_CAPABILITY_ID"
  | "GUARD_NOT_ALLOWED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_INVOCATION_BLOCKED";

export type TAPInvokerFromBaseError = {
  code: TAPInvokerFromBaseErrorCode;
  message: string;
  boundary: TAPTransferBoundary;
  publicSafe: true;
};

export type TAPBaseReusableInvocation = {
  kind: "tap.reuseTransfer.baseInvocation";
  invocationId: string;
  tapCapabilityId: string;
  sourceCapabilityId: string;
  sourceBaseToolName: string;
  input?: unknown;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  deniedScopes: readonly string[];
  trace: TAPTransferTrace;
  dryRun: true;
  baseToolExecutionPlanned: false;
  unsafeSideEffects: false;
};

export type TAPInvokerFromBaseResult =
  | {
      ok: true;
      invocation: TAPBaseReusableInvocation;
      events: readonly string[];
    }
  | {
      ok: false;
      error: TAPInvokerFromBaseError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function cleanTrace(trace: TAPTransferTrace | undefined, fallback: TAPTransferTrace | undefined): TAPTransferTrace {
  return {
    correlationId: trace?.correlationId?.trim() || fallback?.correlationId?.trim() || undefined,
    sessionId: trace?.sessionId?.trim() || fallback?.sessionId?.trim() || undefined,
    callerId: trace?.callerId?.trim() || fallback?.callerId?.trim() || undefined,
  };
}

function failure(
  code: TAPInvokerFromBaseErrorCode,
  message: string,
  boundary: TAPTransferBoundary,
): TAPInvokerFromBaseResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.basicToolLayer.tapReuseTransfer.invoker.rejected"],
  };
}

export function createTAPReusableInvocationFromBase(request?: TAPInvokerFromBaseRequest): TAPInvokerFromBaseResult {
  if (request === undefined || isBlank(request.invocationId)) {
    return failure("MISSING_INVOCATION_ID", "TAP base reusable invocation requires an invocationId", "input");
  }

  if (request.migratedCapability === undefined) {
    return failure(
      "MISSING_MIGRATED_CAPABILITY",
      "TAP base reusable invocation requires a migrated capability descriptor",
      "input",
    );
  }

  if (isBlank(request.migratedCapability.tapCapabilityId)) {
    return failure("MISSING_TAP_CAPABILITY_ID", "TAP base reusable invocation requires a tapCapabilityId", "input");
  }

  if (request.guard !== undefined && (!request.guard.ok || request.guard.allowed !== true)) {
    return failure(
      "GUARD_NOT_ALLOWED",
      "TAP base reusable invocation requires an allowed guard result before planning the call",
      request.guard.ok ? "governance" : request.guard.error.boundary,
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "TAP base reusable invocation was rejected by contract",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "TAP base reusable invocation was rejected by governance",
      "governance",
    );
  }

  if (request.dryRun === false || request.migratedCapability.invocationEnvelope.dryRun !== true) {
    return failure(
      "REAL_INVOCATION_BLOCKED",
      "TAP_invoker_fromBase only creates a dry-run invocation envelope in the first implementation",
      "contract",
    );
  }

  const requestedScopes = cleanList([
    ...request.migratedCapability.requestedScopes,
    ...(request.requestedScopes ?? []),
  ]);
  const allowedScopes = cleanList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0 ? requestedScopes : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `TAP base reusable invocation requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  return {
    ok: true,
    invocation: {
      kind: "tap.reuseTransfer.baseInvocation",
      invocationId: (request.invocationId ?? "").trim(),
      tapCapabilityId: request.migratedCapability.tapCapabilityId.trim(),
      sourceCapabilityId: request.migratedCapability.sourceCapabilityId,
      sourceBaseToolName: request.migratedCapability.sourceBaseToolName,
      input: request.input,
      requestedScopes,
      grantedScopes,
      deniedScopes,
      trace: cleanTrace(request.trace, request.migratedCapability.trace),
      dryRun: true,
      baseToolExecutionPlanned: false,
      unsafeSideEffects: false,
    },
    events: ["agentCore.basicToolLayer.tapReuseTransfer.invoker.planned"],
  };
}
