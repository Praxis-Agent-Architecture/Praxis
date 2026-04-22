/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 摄像头访问。
 * 核心目的：提供 计算机使用基础工具 / 摄像头访问 中的“开始摄像头录制”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CameraStartRecordingBoundary = "input" | "governance" | "scope" | "resource";

export type CameraStartRecordingGate = {
  accepted: boolean;
  reason?: string;
};

export type CameraStartRecordingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: CameraStartRecordingGate;
  allowedDeviceIds?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type CameraStartRecordingRequest = {
  context?: CameraStartRecordingContext;
  deviceId?: string;
  recordingId?: string;
  recordingLabel?: string;
  destinationHint?: string;
  maxDurationMs?: number;
  includeAudio?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CameraStartRecordingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "INVALID_DEVICE_ID"
  | "DEVICE_SCOPE_REJECTED"
  | "INVALID_RECORDING_ID"
  | "INVALID_DESTINATION_HINT"
  | "INVALID_MAX_DURATION"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CameraStartRecordingError = {
  code: CameraStartRecordingErrorCode;
  message: string;
  boundary: CameraStartRecordingBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CameraStartRecordingPlan = {
  toolId: "computeruse.cameraStartRecording";
  capability: "start-camera-recording";
  runtimeId: string;
  invocationId: string;
  deviceId: string;
  recordingId: string;
  recordingLabel?: string;
  destinationHint?: string;
  maxDurationMs: number;
  includeAudio: boolean;
  requiredPermissions: readonly ("camera:read" | "camera:record" | "microphone:record" | "filesystem:write")[];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldStartRecording: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "camera-device-recording-approval";
    event: "basicTool.computeruse.cameraStartRecording.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type CameraStartRecordingResult =
  | {
      ok: true;
      plan: CameraStartRecordingPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CameraStartRecordingError;
      events: readonly string[];
    };

export const cameraStartRecordingDescriptor = {
  toolId: "computeruse.cameraStartRecording",
  capability: "start-camera-recording",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.cameraAccess",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const DEFAULT_DEVICE_ID = "default-camera";
const DEFAULT_MAX_DURATION_MS = 60_000;
const MAX_RECORDING_DURATION_MS = 3_600_000;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CameraStartRecordingErrorCode,
  message: string,
  boundary: CameraStartRecordingBoundary,
): CameraStartRecordingResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.cameraStartRecording.rejected"],
  };
}

function normalizeDeviceId(deviceId: string | undefined): string | CameraStartRecordingResult {
  if (deviceId === undefined) {
    return DEFAULT_DEVICE_ID;
  }

  const normalized = deviceId.trim();
  if (normalized.length === 0 || normalized.includes("\0")) {
    return failure("INVALID_DEVICE_ID", "cameraStartRecording deviceId must be a non-empty safe string", "input");
  }

  return normalized;
}

function normalizeOptionalSafeString(
  value: string | undefined,
  code: "INVALID_RECORDING_ID" | "INVALID_DESTINATION_HINT",
  label: string,
): string | CameraStartRecordingResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0")) {
    return failure(code, `cameraStartRecording ${label} must be a non-empty safe string`, "input");
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CameraStartRecordingResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `cameraStartRecording scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function createRecordingId(runtimeId: string, invocationId: string, deviceId: string): string {
  const raw = `${runtimeId}:${invocationId}:${deviceId}`;
  return `camera-recording:${raw.replace(/[^a-zA-Z0-9._:-]+/g, "-")}`;
}

export function planCameraStartRecording(request: CameraStartRecordingRequest = {}): CameraStartRecordingResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "cameraStartRecording requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round cameraStartRecording only supports dry-run planning",
      "governance",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "cameraStartRecording was rejected by runtime governance",
      "governance",
    );
  }

  const deviceId = normalizeDeviceId(request.deviceId);
  if (typeof deviceId !== "string") {
    return deviceId;
  }

  const allowedDeviceIds = cleanList(request.context?.allowedDeviceIds);
  if (allowedDeviceIds.length > 0 && !allowedDeviceIds.includes(deviceId)) {
    return failure("DEVICE_SCOPE_REJECTED", `camera device ${deviceId} is outside the allowed device scope`, "scope");
  }

  const maxDurationMs = request.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  if (!Number.isInteger(maxDurationMs) || maxDurationMs <= 0 || maxDurationMs > MAX_RECORDING_DURATION_MS) {
    return failure(
      "INVALID_MAX_DURATION",
      "cameraStartRecording maxDurationMs must be between 1 and 3600000",
      "resource",
    );
  }

  const invocationId = request.context?.invocationId?.trim() || "cameraStartRecording:dry-run";
  const recordingId =
    normalizeOptionalSafeString(request.recordingId, "INVALID_RECORDING_ID", "recordingId") ??
    createRecordingId(runtimeId ?? "", invocationId, deviceId);
  if (typeof recordingId !== "string") {
    return recordingId;
  }

  const destinationHint = normalizeOptionalSafeString(
    request.destinationHint,
    "INVALID_DESTINATION_HINT",
    "destinationHint",
  );
  if (destinationHint !== undefined && typeof destinationHint !== "string") {
    return destinationHint;
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const requiredPermissions: CameraStartRecordingPlan["requiredPermissions"] = [
    "camera:read",
    "camera:record",
    ...(request.includeAudio === true ? (["microphone:record"] as const) : []),
    ...(destinationHint !== undefined ? (["filesystem:write"] as const) : []),
  ];

  return {
    ok: true,
    plan: {
      toolId: "computeruse.cameraStartRecording",
      capability: "start-camera-recording",
      runtimeId: runtimeId ?? "",
      invocationId,
      deviceId,
      recordingId,
      recordingLabel: request.recordingLabel?.trim() || undefined,
      destinationHint,
      maxDurationMs,
      includeAudio: request.includeAudio === true,
      requiredPermissions,
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldStartRecording: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "camera-device-recording-approval",
        event: "basicTool.computeruse.cameraStartRecording.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.cameraStartRecording.planned"],
  };
}
