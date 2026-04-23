/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 麦克风访问。
 * 核心目的：提供 计算机使用基础工具 / 麦克风访问 中的“停止麦克风录制”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { MicrophoneAccessBoundary, MicrophoneAccessGate } from "./computeruse.microphoneSelect.js";

export type MicrophoneStopRecordingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: MicrophoneAccessGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneStopRecordingRequest = {
  context?: MicrophoneStopRecordingContext;
  recordingId?: string;
  deviceId?: string;
  persistHint?: string;
  releaseDevice?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MicrophoneStopRecordingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_RECORDING_ID"
  | "INVALID_RECORDING_ID"
  | "INVALID_DEVICE_ID"
  | "INVALID_PERSIST_HINT"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type MicrophoneStopRecordingError = {
  code: MicrophoneStopRecordingErrorCode;
  message: string;
  boundary: MicrophoneAccessBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type MicrophoneStopRecordingPlan = {
  toolId: "computeruse.microphoneStopRecording";
  capability: "stop-microphone-recording";
  runtimeId: string;
  invocationId: string;
  recordingId: string;
  deviceId?: string;
  persistHint?: string;
  requiredPermissions: readonly ("microphone:record" | "filesystem:write")[];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldStopRecording: true;
  wouldReleaseMicrophone: boolean;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "microphone-recording-session-stop-approval";
    event: "basicTool.computeruse.microphoneStopRecording.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type MicrophoneStopRecordingResult =
  | {
      ok: true;
      plan: MicrophoneStopRecordingPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MicrophoneStopRecordingError;
      events: readonly string[];
    };

export const microphoneStopRecordingDescriptor = {
  toolId: "computeruse.microphoneStopRecording",
  capability: "stop-microphone-recording",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.microphoneAccess",
  defaultDispatch: "dry-run",
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
  code: MicrophoneStopRecordingErrorCode,
  message: string,
  boundary: MicrophoneAccessBoundary,
): MicrophoneStopRecordingResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.microphoneStopRecording.rejected"],
  };
}

function normalizeRequiredString(
  value: string | undefined,
  missingCode: "MISSING_RECORDING_ID",
  invalidCode: "INVALID_RECORDING_ID",
  label: string,
): string | MicrophoneStopRecordingResult {
  if (value === undefined) {
    return failure(missingCode, `microphoneStopRecording requires ${label}`, "input");
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0")) {
    return failure(invalidCode, `microphoneStopRecording ${label} must be a non-empty safe string`, "input");
  }

  return normalized;
}

function normalizeOptionalSafeString(
  value: string | undefined,
  code: "INVALID_DEVICE_ID" | "INVALID_PERSIST_HINT",
  label: string,
): string | MicrophoneStopRecordingResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0") || normalized.length > 256) {
    return failure(code, `microphoneStopRecording ${label} must be a bounded safe string`, "input");
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | MicrophoneStopRecordingResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `microphoneStopRecording scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planMicrophoneStopRecording(
  request: MicrophoneStopRecordingRequest = {},
): MicrophoneStopRecordingResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "microphoneStopRecording requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round microphoneStopRecording only supports dry-run planning",
      "governance",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "microphoneStopRecording was rejected by runtime governance",
      "governance",
    );
  }

  const recordingId = normalizeRequiredString(
    request.recordingId,
    "MISSING_RECORDING_ID",
    "INVALID_RECORDING_ID",
    "recordingId",
  );
  if (typeof recordingId !== "string") {
    return recordingId;
  }

  const deviceId = normalizeOptionalSafeString(request.deviceId, "INVALID_DEVICE_ID", "deviceId");
  if (deviceId !== undefined && typeof deviceId !== "string") {
    return deviceId;
  }

  const persistHint = normalizeOptionalSafeString(request.persistHint, "INVALID_PERSIST_HINT", "persistHint");
  if (persistHint !== undefined && typeof persistHint !== "string") {
    return persistHint;
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  return {
    ok: true,
    plan: {
      toolId: "computeruse.microphoneStopRecording",
      capability: "stop-microphone-recording",
      runtimeId: runtimeId ?? "",
      invocationId: request.context?.invocationId?.trim() || "microphoneStopRecording:dry-run",
      recordingId,
      deviceId,
      persistHint,
      requiredPermissions: [
        "microphone:record",
        ...(persistHint !== undefined ? (["filesystem:write"] as const) : []),
      ],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldStopRecording: true,
      wouldReleaseMicrophone: request.releaseDevice !== false,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "microphone-recording-session-stop-approval",
        event: "basicTool.computeruse.microphoneStopRecording.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.microphoneStopRecording.planned"],
  };
}
