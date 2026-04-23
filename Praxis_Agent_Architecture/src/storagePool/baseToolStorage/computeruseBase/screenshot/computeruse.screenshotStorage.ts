/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 截图。
 * 核心目的：提供 计算机使用基础工具 / 截图 中的“存储截图”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ScreenshotStorageBoundary = "input" | "contract" | "governance" | "scope" | "permission";

export type ScreenshotStorageGate = {
  accepted: boolean;
  reason?: string;
};

export type ScreenshotStorageRequest = {
  runtimeId?: string;
  invocationId?: string;
  screenshotRef?: string;
  storageTarget?: string;
  retentionPolicy?: string;
  purpose?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  permission?: ScreenshotStorageGate;
  contract?: ScreenshotStorageGate;
  governance?: ScreenshotStorageGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ScreenshotStorageErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SCREENSHOT_REF"
  | "MISSING_STORAGE_TARGET"
  | "MISSING_PURPOSE"
  | "INVALID_STORAGE_TARGET"
  | "PERMISSION_REQUIRED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type ScreenshotStorageError = {
  code: ScreenshotStorageErrorCode;
  message: string;
  boundary: ScreenshotStorageBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ScreenshotStoragePlan = {
  toolKind: "computeruse.screenshotStorage";
  runtimeId: string;
  invocationId: string;
  screenshotRef: string;
  storageTarget: string;
  retentionPolicy: string;
  purpose: string;
  permissions: readonly ["screen:read:dry-run", "storage:write:dry-run"];
  acceptedScopes: readonly string[];
  dispatch: "dry-run";
  dryRun: true;
  screenshotStored: false;
  unsafeSideEffects: false;
  audit: {
    guard: "privacy-storage-permission";
    event: "basicTool.computeruse.screenshotStorage.planned";
    governanceRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ScreenshotStorageResult =
  | {
      ok: true;
      plan: ScreenshotStoragePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ScreenshotStorageError;
      events: readonly string[];
    };

export const screenshotStorageDescriptor = {
  toolKind: "computeruse.screenshotStorage",
  capability: "store-screenshot",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenshot",
  defaultDispatch: "dry-run",
  defaultRetentionPolicy: "session-scoped",
  requiresPermission: true,
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ScreenshotStorageErrorCode,
  message: string,
  boundary: ScreenshotStorageBoundary,
): ScreenshotStorageResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.screenshotStorage.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ScreenshotStorageResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `screenshot storage scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planScreenshotStorage(request: ScreenshotStorageRequest = {}): ScreenshotStorageResult {
  if (!hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "computeruse.screenshotStorage requires runtimeId", "input");
  }

  if (!hasText(request.screenshotRef)) {
    return failure("MISSING_SCREENSHOT_REF", "computeruse.screenshotStorage requires screenshotRef", "input");
  }

  if (!hasText(request.storageTarget)) {
    return failure("MISSING_STORAGE_TARGET", "computeruse.screenshotStorage requires storageTarget", "input");
  }

  if (request.storageTarget.includes("\0")) {
    return failure("INVALID_STORAGE_TARGET", "computeruse.screenshotStorage storageTarget must be a safe string", "input");
  }

  if (!hasText(request.purpose)) {
    return failure("MISSING_PURPOSE", "computeruse.screenshotStorage requires an explicit purpose", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round computeruse.screenshotStorage only creates a dry-run guard and audit plan",
      "governance",
    );
  }

  if (request.permission?.accepted !== true) {
    return failure(
      "PERMISSION_REQUIRED",
      request.permission?.reason ?? "computeruse.screenshotStorage requires an approved permission gate",
      "permission",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "computeruse.screenshotStorage was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "computeruse.screenshotStorage was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();
  const screenshotRef = request.screenshotRef.trim();

  return {
    ok: true,
    plan: {
      toolKind: "computeruse.screenshotStorage",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:computeruse.screenshotStorage:${screenshotRef}`,
      screenshotRef,
      storageTarget: request.storageTarget.trim(),
      retentionPolicy: request.retentionPolicy?.trim() || screenshotStorageDescriptor.defaultRetentionPolicy,
      purpose: request.purpose.trim(),
      permissions: ["screen:read:dry-run", "storage:write:dry-run"],
      acceptedScopes,
      dispatch: "dry-run",
      dryRun: true,
      screenshotStored: false,
      unsafeSideEffects: false,
      audit: {
        guard: "privacy-storage-permission",
        event: "basicTool.computeruse.screenshotStorage.planned",
        governanceRequired: true,
        tapCanWrap: true,
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.screenshotStorage.planned"],
  };
}
