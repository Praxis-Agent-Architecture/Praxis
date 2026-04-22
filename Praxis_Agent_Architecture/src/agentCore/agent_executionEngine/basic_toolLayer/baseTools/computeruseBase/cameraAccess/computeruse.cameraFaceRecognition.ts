/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 摄像头访问。
 * 核心目的：提供 计算机使用基础工具 / 摄像头访问 中的“识别人脸”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { CameraAccessAuditRecord, CameraAccessBoundary, CameraAccessGate } from "./computeruse.cameraPermissionRequest.js";

export type CameraFaceRecognitionMode = "detect-faces" | "verify-consented-face" | "identify-consented-face";

export type CameraFaceRecognitionInput = {
  runtimeId?: string;
  sessionId?: string;
  frameRef?: string;
  mode?: CameraFaceRecognitionMode;
  deviceId?: string;
  subjectConsent?: CameraAccessGate;
  maxFaces?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: CameraAccessGate;
  governance?: CameraAccessGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraFaceRecognitionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_FRAME_REF"
  | "INVALID_CAMERA_DEVICE"
  | "INVALID_FRAME_REF"
  | "INVALID_FACE_LIMIT"
  | "BIOMETRIC_CONSENT_REQUIRED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_FACE_RECOGNITION_NOT_ALLOWED";

export type CameraFaceRecognitionError = {
  code: CameraFaceRecognitionErrorCode;
  message: string;
  boundary: CameraAccessBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraFaceRecognitionPlan = {
  toolName: "computeruse.cameraFaceRecognition";
  capability: "recognize-faces-from-camera-frame";
  runtimeId: string;
  sessionId?: string;
  target: {
    frameRef: string;
    deviceId?: string;
    mode: CameraFaceRecognitionMode;
    maxFaces: number;
  };
  requiredPermission: "camera:read";
  requiresTapApproval: true;
  acceptedScopes: readonly string[];
  execution: {
    dispatch: "dry-run";
    dryRun: true;
    recognitionPlanned: true;
    recognitionPerformed: false;
    identityResolved: false;
    faceDataStored: false;
    realCameraTouched: false;
    unsafeSideEffects: false;
  };
  audit: CameraAccessAuditRecord;
};

export type CameraFaceRecognitionResult =
  | {
      ok: true;
      plan: CameraFaceRecognitionPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CameraFaceRecognitionError;
      events: readonly string[];
    };

export const cameraFaceRecognitionDescriptor = {
  toolName: "computeruse.cameraFaceRecognition",
  capability: "recognize-faces-from-camera-frame",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDispatch: "dry-run",
  requiredPermission: "camera:read",
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
  code: CameraFaceRecognitionErrorCode,
  message: string,
  boundary: CameraAccessBoundary,
): CameraFaceRecognitionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.cameraFaceRecognition.rejected"],
  };
}

function normalizeOpaqueRef(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.includes("\0") || normalized.length > 256) {
    return undefined;
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CameraFaceRecognitionResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `computeruse.cameraFaceRecognition scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function isIdentityMode(mode: CameraFaceRecognitionMode): boolean {
  return mode === "verify-consented-face" || mode === "identify-consented-face";
}

export function planCameraFaceRecognition(
  request: CameraFaceRecognitionInput = {},
): CameraFaceRecognitionResult {
  if (isBlank(request.runtimeId)) {
    return failure(
      "MISSING_RUNTIME_ID",
      "computeruse.cameraFaceRecognition requires a runtimeId for audit correlation",
      "input",
    );
  }

  const frameRef = normalizeOpaqueRef(request.frameRef);
  if (frameRef === undefined) {
    if (request.frameRef !== undefined && request.frameRef.trim().length > 0) {
      return failure("INVALID_FRAME_REF", "camera frameRef must be a bounded opaque reference", "input");
    }

    return failure("MISSING_FRAME_REF", "computeruse.cameraFaceRecognition requires an injected frameRef", "input");
  }

  const deviceId = normalizeOpaqueRef(request.deviceId);
  if (request.deviceId !== undefined && deviceId === undefined) {
    return failure("INVALID_CAMERA_DEVICE", "camera deviceId must be a bounded opaque identifier", "input");
  }

  const maxFaces = request.maxFaces ?? 16;
  if (!Number.isInteger(maxFaces) || maxFaces < 1 || maxFaces > 64) {
    return failure("INVALID_FACE_LIMIT", "computeruse.cameraFaceRecognition maxFaces must be between 1 and 64", "input");
  }

  const mode = request.mode ?? "detect-faces";
  if (isIdentityMode(mode) && request.subjectConsent?.accepted !== true) {
    return failure(
      "BIOMETRIC_CONSENT_REQUIRED",
      request.subjectConsent?.reason ?? "identity-level face recognition requires explicit subject consent",
      "governance",
    );
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_FACE_RECOGNITION_NOT_ALLOWED",
      "first-round computeruse.cameraFaceRecognition only supports dry-run planning",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "camera face recognition was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "camera face recognition was rejected by runtime governance",
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
      toolName: "computeruse.cameraFaceRecognition",
      capability: "recognize-faces-from-camera-frame",
      runtimeId: request.runtimeId?.trim() ?? "",
      sessionId: request.sessionId?.trim() || undefined,
      target: {
        frameRef,
        deviceId,
        mode,
        maxFaces,
      },
      requiredPermission: "camera:read",
      requiresTapApproval: true,
      acceptedScopes,
      execution: {
        dispatch: "dry-run",
        dryRun: true,
        recognitionPlanned: true,
        recognitionPerformed: false,
        identityResolved: false,
        faceDataStored: false,
        realCameraTouched: false,
        unsafeSideEffects: false,
      },
      audit: {
        guard: "frame-consent-contract-governance-and-scope",
        event: "basicTool.computeruse.cameraFaceRecognition.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.computeruse.cameraFaceRecognition.planned"],
  };
}
