/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 摄像头访问。
 * 核心目的：提供 计算机使用基础工具 / 摄像头访问 中的“申请摄像头权限”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CameraAccessBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type CameraAccessGate = {
  accepted: boolean;
  reason?: string;
};

export type CameraAccessAuditRecord = {
  guard: string;
  event: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type CameraPermissionRequestInput = {
  runtimeId?: string;
  sessionId?: string;
  deviceId?: string;
  purpose?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CameraAccessGate;
  governance?: CameraAccessGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraPermissionRequestErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_PERMISSION_PURPOSE"
  | "INVALID_CAMERA_DEVICE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_CAMERA_PERMISSION_REQUEST_NOT_ALLOWED";

export type CameraPermissionRequestError = {
  code: CameraPermissionRequestErrorCode;
  message: string;
  boundary: CameraAccessBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraPermissionRequestPlan = {
  toolName: "computeruse.cameraPermissionRequest";
  capability: "request-camera-permission";
  runtimeId: string;
  sessionId?: string;
  target: {
    deviceId?: string;
    purpose: string;
  };
  requiredPermission: "camera:access";
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  execution: {
    dispatch: "dry-run";
    dryRun: true;
    permissionRequested: true;
    permissionGranted: false;
    realCameraTouched: false;
    unsafeSideEffects: false;
  };
  audit: CameraAccessAuditRecord;
};

export type CameraPermissionRequestResult =
  | {
      ok: true;
      plan: CameraPermissionRequestPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CameraPermissionRequestError;
      events: readonly string[];
    };

export const cameraPermissionRequestDescriptor = {
  toolName: "computeruse.cameraPermissionRequest",
  capability: "request-camera-permission",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDispatch: "dry-run",
  requiredPermission: "camera:access",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CameraPermissionRequestErrorCode,
  message: string,
  boundary: CameraAccessBoundary,
): CameraPermissionRequestResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.cameraPermissionRequest.rejected"],
  };
}

function normalizeOptionalId(value: string | undefined): string | undefined | "invalid" {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.includes("\0") || normalized.length > 128) {
    return "invalid";
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CameraPermissionRequestResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `computeruse.cameraPermissionRequest scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planCameraPermissionRequest(
  request: CameraPermissionRequestInput = {},
): CameraPermissionRequestResult {
  if (isBlank(request.runtimeId)) {
    return failure(
      "MISSING_RUNTIME_ID",
      "computeruse.cameraPermissionRequest requires a runtimeId for audit correlation",
      "input",
    );
  }

  if (isBlank(request.purpose)) {
    return failure(
      "MISSING_PERMISSION_PURPOSE",
      "computeruse.cameraPermissionRequest requires a purpose before asking for camera access",
      "input",
    );
  }

  const deviceId = normalizeOptionalId(request.deviceId);
  if (deviceId === "invalid") {
    return failure("INVALID_CAMERA_DEVICE", "camera deviceId must be a bounded opaque identifier", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_CAMERA_PERMISSION_REQUEST_NOT_ALLOWED",
      "first-round computeruse.cameraPermissionRequest only supports dry-run planning",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "camera permission request was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "camera permission request was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      toolName: "computeruse.cameraPermissionRequest",
      capability: "request-camera-permission",
      runtimeId: request.runtimeId?.trim() ?? "",
      sessionId: request.sessionId?.trim() || undefined,
      target: {
        deviceId,
        purpose: request.purpose?.trim() ?? "",
      },
      requiredPermission: "camera:access",
      requiresTapApproval: true,
      acceptedScopes,
      execution: {
        dispatch: "dry-run",
        dryRun: true,
        permissionRequested: true,
        permissionGranted: false,
        realCameraTouched: false,
        unsafeSideEffects: false,
      },
      audit: {
        guard: "purpose-contract-governance-and-scope",
        event: "basicTool.computeruse.cameraPermissionRequest.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.cameraPermissionRequest.planned"],
  };
}
