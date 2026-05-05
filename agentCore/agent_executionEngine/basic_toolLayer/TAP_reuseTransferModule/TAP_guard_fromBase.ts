/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / TAP 复用转接层。
 * 核心目的：承载 TAP guard from Base 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type TAPTransferBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type TAPTransferDecision = "allowed" | "pending-approval" | "rejected" | "error";

export type TAPTransferGate = {
  accepted: boolean;
  reason?: string;
};

export type TAPTransferApproval = {
  required?: boolean;
  granted?: boolean;
  reason?: string;
};

export type TAPTransferTrace = {
  correlationId?: string;
  sessionId?: string;
  callerId?: string;
};

export type TAPBaseToolCapabilityDescriptor = {
  capabilityId?: string;
  baseToolName?: string;
  capabilityName?: string;
  description?: string;
  requestedScopes?: readonly string[];
  requiredPermissions?: readonly string[];
  observableState?: "available" | "degraded" | "unavailable" | "unknown";
  metadata?: Readonly<Record<string, unknown>>;
};

export type TAPGuardFromBaseRequest = {
  transferId?: string;
  capability?: TAPBaseToolCapabilityDescriptor;
  tapConsumerId?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  requestedPermissions?: readonly string[];
  grantedPermissions?: readonly string[];
  approval?: TAPTransferApproval;
  contract?: TAPTransferGate;
  governance?: TAPTransferGate;
  runtimeReady?: boolean;
  dryRun?: boolean;
  trace?: TAPTransferTrace;
};

export type TAPGuardFromBaseErrorCode =
  | "MISSING_TRANSFER_ID"
  | "MISSING_CAPABILITY"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_BASE_TOOL_NAME"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "PERMISSION_DENIED"
  | "REAL_TRANSFER_BLOCKED";

export type TAPGuardFromBaseError = {
  code: TAPGuardFromBaseErrorCode;
  message: string;
  boundary: TAPTransferBoundary;
  publicSafe: true;
};

export type TAPGuardFromBaseAudit = {
  transferId: string;
  capabilityId: string;
  baseToolName: string;
  tapConsumerId?: string;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  deniedScopes: readonly string[];
  requestedPermissions: readonly string[];
  grantedPermissions: readonly string[];
  missingPermissions: readonly string[];
  trace: TAPTransferTrace;
  dryRun: true;
  unsafeSideEffects: false;
};

export type TAPGuardFromBaseResult =
  | {
      ok: true;
      decision: "allowed" | "pending-approval";
      allowed: boolean;
      audit: TAPGuardFromBaseAudit;
      events: readonly string[];
    }
  | {
      ok: false;
      decision: "rejected" | "error";
      error: TAPGuardFromBaseError;
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
  code: TAPGuardFromBaseErrorCode,
  message: string,
  boundary: TAPTransferBoundary,
  decision: "rejected" | "error" = "rejected",
): TAPGuardFromBaseResult {
  return {
    ok: false,
    decision,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.basicToolLayer.tapReuseTransfer.guard.rejected"],
  };
}

function mergeCapabilityList(
  capabilityValues: readonly string[] | undefined,
  requestValues: readonly string[] | undefined,
): readonly string[] {
  return cleanList([...(capabilityValues ?? []), ...(requestValues ?? [])]);
}

export function guardTAPReuseTransferFromBase(request?: TAPGuardFromBaseRequest): TAPGuardFromBaseResult {
  if (request === undefined || isBlank(request.transferId)) {
    return failure("MISSING_TRANSFER_ID", "TAP base reuse transfer guard requires a transferId", "input", "error");
  }

  if (request.capability === undefined) {
    return failure("MISSING_CAPABILITY", "TAP base reuse transfer guard requires a base tool capability", "input", "error");
  }

  if (isBlank(request.capability.capabilityId)) {
    return failure("MISSING_CAPABILITY_ID", "TAP base reuse transfer guard requires a capabilityId", "input", "error");
  }

  if (isBlank(request.capability.baseToolName)) {
    return failure("MISSING_BASE_TOOL_NAME", "TAP base reuse transfer guard requires a baseToolName", "input", "error");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "TAP base reuse transfer requires a ready runtime", "runtime-state", "error");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "TAP base reuse transfer was rejected by contract",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "TAP base reuse transfer was rejected by governance",
      "governance",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_TRANSFER_BLOCKED",
      "TAP_guard_fromBase only returns a dry-run guard envelope in the first implementation",
      "contract",
    );
  }

  const requestedScopes = mergeCapabilityList(request.capability.requestedScopes, request.requestedScopes);
  const allowedScopes = cleanList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0 ? requestedScopes : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `TAP base reuse transfer requested scopes outside the allowed boundary: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const requestedPermissions = mergeCapabilityList(
    request.capability.requiredPermissions,
    request.requestedPermissions,
  );
  const grantedPermissions = cleanList(request.grantedPermissions);
  const missingPermissions =
    requestedPermissions.length === 0
      ? []
      : requestedPermissions.filter((permission) => !grantedPermissions.includes(permission));

  if (missingPermissions.length > 0) {
    return failure(
      "PERMISSION_DENIED",
      `TAP base reuse transfer is missing permissions: ${missingPermissions.join(", ")}`,
      "governance",
    );
  }

  const audit: TAPGuardFromBaseAudit = {
    transferId: (request.transferId ?? "").trim(),
    capabilityId: (request.capability.capabilityId ?? "").trim(),
    baseToolName: (request.capability.baseToolName ?? "").trim(),
    tapConsumerId: request.tapConsumerId?.trim() || undefined,
    requestedScopes,
    grantedScopes,
    deniedScopes,
    requestedPermissions,
    grantedPermissions,
    missingPermissions,
    trace: cleanTrace(request.trace),
    dryRun: true,
    unsafeSideEffects: false,
  };

  if (request.approval?.required === true && request.approval.granted !== true) {
    return {
      ok: true,
      decision: "pending-approval",
      allowed: false,
      audit,
      events: ["agentCore.basicToolLayer.tapReuseTransfer.guard.pendingApproval"],
    };
  }

  return {
    ok: true,
    decision: "allowed",
    allowed: true,
    audit,
    events: ["agentCore.basicToolLayer.tapReuseTransfer.guard.allowed"],
  };
}
