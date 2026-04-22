/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 屏幕录制。
 * 核心目的：提供 计算机使用基础工具 / 屏幕录制 中的“窗口录制”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type WindowScreenRecordingBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "permission"
  | "resource";

export type WindowScreenRecordingGate = {
  accepted: boolean;
  reason?: string;
};

export type WindowScreenRecordingTarget = {
  windowId?: string;
  titleHint?: string;
};

export type WindowScreenRecordingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  permission?: WindowScreenRecordingGate;
  contract?: WindowScreenRecordingGate;
  governance?: WindowScreenRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type WindowScreenRecordingRequest = {
  context?: WindowScreenRecordingContext;
  target?: WindowScreenRecordingTarget;
  purpose?: string;
  recordingId?: string;
  destinationHint?: string;
  maxDurationMs?: number;
  frameRate?: number;
  includeCursor?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type WindowScreenRecordingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_PURPOSE"
  | "MISSING_WINDOW_TARGET"
  | "INVALID_WINDOW_TARGET"
  | "INVALID_RECORDING_ID"
  | "INVALID_DESTINATION_HINT"
  | "INVALID_MAX_DURATION"
  | "INVALID_FRAME_RATE"
  | "PERMISSION_REQUIRED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type WindowScreenRecordingError = {
  code: WindowScreenRecordingErrorCode;
  message: string;
  boundary: WindowScreenRecordingBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type WindowScreenRecordingPlan = {
  toolId: "computeruse.windowScreenRecording";
  capability: "record-window-screen";
  runtimeId: string;
  invocationId: string;
  target: {
    windowId?: string;
    titleHint?: string;
  };
  purpose: string;
  recordingId: string;
  destinationHint?: string;
  maxDurationMs: number;
  frameRate: number;
  includeCursor: boolean;
  requiredPermissions: readonly ("screen:read" | "display:capture" | "window:inspect" | "filesystem:write")[];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldStartRecording: true;
  recordingStarted: false;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "window-screen-recording-permission";
    event: "basicTool.computeruse.windowScreenRecording.planned";
    privacyReviewRequired: true;
    tapCanWrap: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type WindowScreenRecordingResult =
  | {
      ok: true;
      plan: WindowScreenRecordingPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: WindowScreenRecordingError;
      events: readonly string[];
    };

export const windowScreenRecordingDescriptor = {
  toolId: "computeruse.windowScreenRecording",
  capability: "record-window-screen",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenRecording",
  defaultDispatch: "dry-run",
  defaultMaxDurationMs: 60_000,
  maxDurationMs: 3_600_000,
  defaultFrameRate: 15,
  maxFrameRate: 60,
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
  code: WindowScreenRecordingErrorCode,
  message: string,
  boundary: WindowScreenRecordingBoundary,
): WindowScreenRecordingResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.windowScreenRecording.rejected"],
  };
}

function normalizeOptionalSafeString(
  value: string | undefined,
  code: "INVALID_RECORDING_ID" | "INVALID_DESTINATION_HINT" | "INVALID_WINDOW_TARGET",
  label: string,
): string | WindowScreenRecordingResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0")) {
    return failure(code, `windowScreenRecording ${label} must be a safe string`, "input");
  }

  return normalized;
}

function normalizeTarget(
  target: WindowScreenRecordingTarget | undefined,
): WindowScreenRecordingPlan["target"] | WindowScreenRecordingResult {
  if (target === undefined) {
    return failure("MISSING_WINDOW_TARGET", "windowScreenRecording requires windowId or titleHint", "input");
  }

  const windowId = normalizeOptionalSafeString(target.windowId, "INVALID_WINDOW_TARGET", "windowId");
  if (windowId !== undefined && typeof windowId !== "string") {
    return windowId;
  }

  const titleHint = normalizeOptionalSafeString(target.titleHint, "INVALID_WINDOW_TARGET", "titleHint");
  if (titleHint !== undefined && typeof titleHint !== "string") {
    return titleHint;
  }

  if (windowId === undefined && titleHint === undefined) {
    return failure("MISSING_WINDOW_TARGET", "windowScreenRecording requires windowId or titleHint", "input");
  }

  return { windowId, titleHint };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | WindowScreenRecordingResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `windowScreenRecording scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function createRecordingId(runtimeId: string, invocationId: string, target: WindowScreenRecordingPlan["target"]): string {
  const targetKey = target.windowId ?? target.titleHint ?? "unknown-window";
  const raw = `${runtimeId}:${invocationId}:${targetKey}`;
  return `window-screen-recording:${raw.replace(/[^a-zA-Z0-9._:-]+/g, "-")}`;
}

export function planWindowScreenRecording(
  request: WindowScreenRecordingRequest = {},
): WindowScreenRecordingResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "windowScreenRecording requires context.runtimeId for audit", "input");
  }

  if (isBlank(request.purpose)) {
    return failure("MISSING_PURPOSE", "windowScreenRecording requires an explicit purpose", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round windowScreenRecording only supports dry-run planning",
      "governance",
    );
  }

  if (request.context?.permission?.accepted !== true) {
    return failure(
      "PERMISSION_REQUIRED",
      request.context?.permission?.reason ?? "windowScreenRecording requires an approved permission gate",
      "permission",
    );
  }

  if (request.context?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.context.contract.reason ?? "windowScreenRecording was rejected by contract surface",
      "contract",
    );
  }

  if (request.context?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.governance.reason ?? "windowScreenRecording was rejected by runtime governance",
      "governance",
    );
  }

  const target = normalizeTarget(request.target);
  if ("ok" in target) {
    return target;
  }

  const maxDurationMs = request.maxDurationMs ?? windowScreenRecordingDescriptor.defaultMaxDurationMs;
  if (
    !Number.isInteger(maxDurationMs) ||
    maxDurationMs <= 0 ||
    maxDurationMs > windowScreenRecordingDescriptor.maxDurationMs
  ) {
    return failure(
      "INVALID_MAX_DURATION",
      "windowScreenRecording maxDurationMs must be between 1 and 3600000",
      "resource",
    );
  }

  const frameRate = request.frameRate ?? windowScreenRecordingDescriptor.defaultFrameRate;
  if (!Number.isInteger(frameRate) || frameRate <= 0 || frameRate > windowScreenRecordingDescriptor.maxFrameRate) {
    return failure("INVALID_FRAME_RATE", "windowScreenRecording frameRate must be between 1 and 60", "resource");
  }

  const invocationId = request.context?.invocationId?.trim() || "windowScreenRecording:dry-run";
  const recordingId =
    normalizeOptionalSafeString(request.recordingId, "INVALID_RECORDING_ID", "recordingId") ??
    createRecordingId(runtimeId ?? "", invocationId, target);
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

  const requiredPermissions: WindowScreenRecordingPlan["requiredPermissions"] = [
    "screen:read",
    "display:capture",
    "window:inspect",
    ...(destinationHint !== undefined ? (["filesystem:write"] as const) : []),
  ];

  return {
    ok: true,
    plan: {
      toolId: "computeruse.windowScreenRecording",
      capability: "record-window-screen",
      runtimeId: runtimeId ?? "",
      invocationId,
      target,
      purpose: request.purpose?.trim() ?? "",
      recordingId,
      destinationHint,
      maxDurationMs,
      frameRate,
      includeCursor: request.includeCursor !== false,
      requiredPermissions,
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldStartRecording: true,
      recordingStarted: false,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "window-screen-recording-permission",
        event: "basicTool.computeruse.windowScreenRecording.planned",
        privacyReviewRequired: true,
        tapCanWrap: true,
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.windowScreenRecording.planned"],
  };
}
