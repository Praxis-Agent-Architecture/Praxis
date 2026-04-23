/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 摄像头访问。
 * 核心目的：提供 计算机使用基础工具 / 摄像头访问 中的“存储摄像头内容”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CameraContentStorageBoundary = "input" | "contract" | "governance" | "scope" | "permission";

export type CameraContentStorageGate = {
  accepted: boolean;
  reason?: string;
};

export type CameraContentStorageRequest = {
  runtimeId?: string;
  invocationId?: string;
  contentRef?: string;
  storageTarget?: string;
  retentionPolicy?: string;
  purpose?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  permission?: CameraContentStorageGate;
  contract?: CameraContentStorageGate;
  governance?: CameraContentStorageGate;
};

export type CameraContentStorageErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CONTENT_REF"
  | "MISSING_STORAGE_TARGET"
  | "MISSING_PURPOSE"
  | "PERMISSION_REQUIRED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CameraContentStorageError = {
  code: CameraContentStorageErrorCode;
  message: string;
  boundary: CameraContentStorageBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraContentStoragePlan = {
  toolKind: "computeruse.cameraContentStorage";
  runtimeId: string;
  invocationId: string;
  contentRef: string;
  storageTarget: string;
  retentionPolicy: string;
  purpose: string;
  permissions: readonly string[];
  acceptedScopes: readonly string[];
  execution: {
    dryRun: true;
    contentStored: false;
    unsafeSideEffects: false;
  };
  audit: {
    capability: "store-camera-content";
    governanceRequired: true;
    privacyReviewRequired: true;
    tapCanWrap: true;
  };
};

export type CameraContentStorageResult =
  | {
      ok: true;
      plan: CameraContentStoragePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CameraContentStorageError;
      events: readonly string[];
    };

export const cameraContentStorageDescriptor = {
  toolKind: "computeruse.cameraContentStorage",
  purpose: "prepare a governed dry-run camera content storage envelope",
  defaultRetentionPolicy: "session-scoped",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CameraContentStorageErrorCode,
  message: string,
  boundary: CameraContentStorageBoundary,
): CameraContentStorageResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.cameraContentStorage.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CameraContentStorageResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `camera content storage scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planCameraContentStorage(request?: CameraContentStorageRequest): CameraContentStorageResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "camera content storage requires runtimeId", "input");
  }

  if (!hasText(request.contentRef)) {
    return failure("MISSING_CONTENT_REF", "camera content storage requires contentRef", "input");
  }

  if (!hasText(request.storageTarget)) {
    return failure("MISSING_STORAGE_TARGET", "camera content storage requires storageTarget", "input");
  }

  if (!hasText(request.purpose)) {
    return failure("MISSING_PURPOSE", "camera content storage requires an explicit purpose", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round camera content storage only creates a dry-run guard and audit plan",
      "governance",
    );
  }

  if (request.permission?.accepted !== true) {
    return failure(
      "PERMISSION_REQUIRED",
      request.permission?.reason ?? "camera content storage requires an approved permission gate",
      "permission",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "camera content storage was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "camera content storage was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();
  const contentRef = request.contentRef.trim();

  return {
    ok: true,
    plan: {
      toolKind: "computeruse.cameraContentStorage",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:computeruse.cameraContentStorage:${contentRef}`,
      contentRef,
      storageTarget: request.storageTarget.trim(),
      retentionPolicy: request.retentionPolicy?.trim() || cameraContentStorageDescriptor.defaultRetentionPolicy,
      purpose: request.purpose.trim(),
      permissions: ["camera:read:dry-run", "storage:write:dry-run"],
      acceptedScopes,
      execution: {
        dryRun: true,
        contentStored: false,
        unsafeSideEffects: false,
      },
      audit: {
        capability: "store-camera-content",
        governanceRequired: true,
        privacyReviewRequired: true,
        tapCanWrap: true,
      },
    },
    events: ["basicTool.computeruse.cameraContentStorage.planned"],
  };
}
