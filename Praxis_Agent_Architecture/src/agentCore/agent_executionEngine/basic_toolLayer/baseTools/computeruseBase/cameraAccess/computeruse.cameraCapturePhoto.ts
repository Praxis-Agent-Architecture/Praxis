/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 摄像头访问。
 * 核心目的：提供 计算机使用基础工具 / 摄像头访问 中的“拍摄照片”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CameraCapturePhotoBoundary = "input" | "contract" | "governance" | "scope" | "permission";

export type CameraCapturePhotoGate = {
  accepted: boolean;
  reason?: string;
};

export type CameraCapturePhotoRequest = {
  runtimeId?: string;
  invocationId?: string;
  cameraId?: string;
  purpose?: string;
  outputFormat?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  permission?: CameraCapturePhotoGate;
  contract?: CameraCapturePhotoGate;
  governance?: CameraCapturePhotoGate;
};

export type CameraCapturePhotoErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CAMERA_ID"
  | "MISSING_PURPOSE"
  | "PERMISSION_REQUIRED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CameraCapturePhotoError = {
  code: CameraCapturePhotoErrorCode;
  message: string;
  boundary: CameraCapturePhotoBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraCapturePhotoPlan = {
  toolKind: "computeruse.cameraCapturePhoto";
  runtimeId: string;
  invocationId: string;
  cameraId: string;
  purpose: string;
  outputFormat: string;
  permissions: readonly string[];
  acceptedScopes: readonly string[];
  execution: {
    dryRun: true;
    photoCaptured: false;
    unsafeSideEffects: false;
  };
  audit: {
    capability: "capture-camera-photo";
    governanceRequired: true;
    privacyReviewRequired: true;
    tapCanWrap: true;
  };
};

export type CameraCapturePhotoResult =
  | {
      ok: true;
      plan: CameraCapturePhotoPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CameraCapturePhotoError;
      events: readonly string[];
    };

export const cameraCapturePhotoDescriptor = {
  toolKind: "computeruse.cameraCapturePhoto",
  purpose: "prepare a governed dry-run camera photo capture envelope",
  defaultOutputFormat: "image/jpeg",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CameraCapturePhotoErrorCode,
  message: string,
  boundary: CameraCapturePhotoBoundary,
): CameraCapturePhotoResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.cameraCapturePhoto.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CameraCapturePhotoResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `camera capture scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planCameraCapturePhoto(request?: CameraCapturePhotoRequest): CameraCapturePhotoResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "camera photo capture requires runtimeId", "input");
  }

  if (!hasText(request.cameraId)) {
    return failure("MISSING_CAMERA_ID", "camera photo capture requires cameraId", "input");
  }

  if (!hasText(request.purpose)) {
    return failure("MISSING_PURPOSE", "camera photo capture requires an explicit purpose", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round camera photo capture only creates a dry-run guard and audit plan",
      "governance",
    );
  }

  if (request.permission?.accepted !== true) {
    return failure(
      "PERMISSION_REQUIRED",
      request.permission?.reason ?? "camera photo capture requires an approved permission gate",
      "permission",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "camera photo capture was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "camera photo capture was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = request.runtimeId.trim();
  const cameraId = request.cameraId.trim();

  return {
    ok: true,
    plan: {
      toolKind: "computeruse.cameraCapturePhoto",
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:computeruse.cameraCapturePhoto:${cameraId}`,
      cameraId,
      purpose: request.purpose.trim(),
      outputFormat: request.outputFormat?.trim() || cameraCapturePhotoDescriptor.defaultOutputFormat,
      permissions: ["camera:read:dry-run"],
      acceptedScopes,
      execution: {
        dryRun: true,
        photoCaptured: false,
        unsafeSideEffects: false,
      },
      audit: {
        capability: "capture-camera-photo",
        governanceRequired: true,
        privacyReviewRequired: true,
        tapCanWrap: true,
      },
    },
    events: ["basicTool.computeruse.cameraCapturePhoto.planned"],
  };
}
