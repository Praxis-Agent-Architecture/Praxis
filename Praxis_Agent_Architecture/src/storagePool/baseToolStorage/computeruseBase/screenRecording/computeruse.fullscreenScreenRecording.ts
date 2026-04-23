/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 屏幕录制。
 * 核心目的：提供 计算机使用基础工具 / 屏幕录制 中的“全屏录制”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type FullscreenScreenRecordingBoundary = "input" | "governance" | "scope" | "permission" | "resource";

export type FullscreenScreenRecordingGate = {
  accepted: boolean;
  reason?: string;
};

export type FullscreenScreenRecordingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: FullscreenScreenRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenRecordingRequest = {
  context?: FullscreenScreenRecordingContext;
  displayId?: string;
  recordingId?: string;
  destinationHint?: string;
  maxDurationMs?: number;
  includeCursor?: boolean;
  includeAudio?: boolean;
  permission?: FullscreenScreenRecordingGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type FullscreenScreenRecordingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "PERMISSION_REQUIRED"
  | "INVALID_DISPLAY_ID"
  | "INVALID_RECORDING_ID"
  | "INVALID_DESTINATION_HINT"
  | "INVALID_MAX_DURATION"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type FullscreenScreenRecordingError = {
  code: FullscreenScreenRecordingErrorCode;
  message: string;
  boundary: FullscreenScreenRecordingBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type FullscreenScreenRecordingPlan = {
  toolId: "computeruse.fullscreenScreenRecording";
  capability: "record-fullscreen";
  runtimeId: string;
  invocationId: string;
  displayId: string;
  recordingId: string;
  destinationHint?: string;
  maxDurationMs: number;
  includeCursor: boolean;
  includeAudio: boolean;
  requiredPermissions: readonly ("screen:record" | "microphone:record" | "filesystem:write")[];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldStartRecording: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "fullscreen-recording-approval";
    event: "basicTool.computeruse.fullscreenScreenRecording.planned";
    privacyReviewRequired: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type FullscreenScreenRecordingResult =
  | {
      ok: true;
      plan: FullscreenScreenRecordingPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: FullscreenScreenRecordingError;
      events: readonly string[];
    };

export const fullscreenScreenRecordingDescriptor = {
  toolId: "computeruse.fullscreenScreenRecording",
  capability: "record-fullscreen",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenRecording",
  defaultDispatch: "dry-run",
  defaultMaxDurationMs: 30_000,
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const DEFAULT_DISPLAY_ID = "primary-display";
const MAX_RECORDING_DURATION_MS = 3_600_000;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: FullscreenScreenRecordingErrorCode,
  message: string,
  boundary: FullscreenScreenRecordingBoundary,
): FullscreenScreenRecordingResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.fullscreenScreenRecording.rejected"],
  };
}

function normalizeSafeString(
  value: string | undefined,
  defaultValue: string | undefined,
  code: "INVALID_DISPLAY_ID" | "INVALID_RECORDING_ID" | "INVALID_DESTINATION_HINT",
  label: string,
): string | FullscreenScreenRecordingResult | undefined {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0")) {
    return failure(code, `fullscreenScreenRecording ${label} must be a non-empty safe string`, "input");
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | FullscreenScreenRecordingResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `fullscreenScreenRecording scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function createRecordingId(runtimeId: string, invocationId: string, displayId: string): string {
  const raw = `${runtimeId}:${invocationId}:${displayId}`;
  return `screen-recording:${raw.replace(/[^a-zA-Z0-9._:-]+/g, "-")}`;
}

export function planFullscreenScreenRecording(
  request: FullscreenScreenRecordingRequest = {},
): FullscreenScreenRecordingResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "fullscreenScreenRecording requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round fullscreenScreenRecording only supports dry-run planning",
      "governance",
    );
  }

  if (request.permission?.accepted !== true) {
    return failure(
      "PERMISSION_REQUIRED",
      request.permission?.reason ?? "fullscreenScreenRecording requires an approved permission gate",
      "permission",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "fullscreenScreenRecording was rejected by runtime governance",
      "governance",
    );
  }

  const maxDurationMs = request.maxDurationMs ?? fullscreenScreenRecordingDescriptor.defaultMaxDurationMs;
  if (!Number.isInteger(maxDurationMs) || maxDurationMs <= 0 || maxDurationMs > MAX_RECORDING_DURATION_MS) {
    return failure(
      "INVALID_MAX_DURATION",
      "fullscreenScreenRecording maxDurationMs must be between 1 and 3600000",
      "resource",
    );
  }

  const displayId = normalizeSafeString(request.displayId, DEFAULT_DISPLAY_ID, "INVALID_DISPLAY_ID", "displayId");
  if (displayId === undefined || typeof displayId !== "string") {
    return displayId ?? failure("INVALID_DISPLAY_ID", "fullscreenScreenRecording displayId is invalid", "input");
  }

  const invocationId = request.context?.invocationId?.trim() || "fullscreenScreenRecording:dry-run";
  const recordingId =
    normalizeSafeString(request.recordingId, createRecordingId(runtimeId ?? "", invocationId, displayId), "INVALID_RECORDING_ID", "recordingId");
  if (recordingId === undefined || typeof recordingId !== "string") {
    return recordingId ?? failure("INVALID_RECORDING_ID", "fullscreenScreenRecording recordingId is invalid", "input");
  }

  const destinationHint = normalizeSafeString(
    request.destinationHint,
    undefined,
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

  const requiredPermissions: FullscreenScreenRecordingPlan["requiredPermissions"] = [
    "screen:record",
    ...(request.includeAudio === true ? (["microphone:record"] as const) : []),
    ...(destinationHint !== undefined ? (["filesystem:write"] as const) : []),
  ];

  return {
    ok: true,
    plan: {
      toolId: "computeruse.fullscreenScreenRecording",
      capability: "record-fullscreen",
      runtimeId: runtimeId ?? "",
      invocationId,
      displayId,
      recordingId,
      destinationHint,
      maxDurationMs,
      includeCursor: request.includeCursor !== false,
      includeAudio: request.includeAudio === true,
      requiredPermissions,
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldStartRecording: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "fullscreen-recording-approval",
        event: "basicTool.computeruse.fullscreenScreenRecording.planned",
        privacyReviewRequired: true,
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.fullscreenScreenRecording.planned"],
  };
}
