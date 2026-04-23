/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 计算机使用基础工具 / 屏幕录制。
 * 核心目的：提供 计算机使用基础工具 / 屏幕录制 中的“区域录制”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RectangularSelectionScreenRecordingBoundary =
  | "input"
  | "governance"
  | "scope"
  | "permission"
  | "resource";

export type RectangularSelectionScreenRecordingGate = {
  accepted: boolean;
  reason?: string;
};

export type ScreenRecordingRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RectangularSelectionScreenRecordingContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: RectangularSelectionScreenRecordingGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenRecordingRequest = {
  context?: RectangularSelectionScreenRecordingContext;
  displayId?: string;
  rectangle?: ScreenRecordingRectangle;
  recordingId?: string;
  destinationHint?: string;
  maxDurationMs?: number;
  includeCursor?: boolean;
  includeAudio?: boolean;
  permission?: RectangularSelectionScreenRecordingGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RectangularSelectionScreenRecordingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "PERMISSION_REQUIRED"
  | "MISSING_RECTANGLE"
  | "INVALID_RECTANGLE"
  | "INVALID_DISPLAY_ID"
  | "INVALID_RECORDING_ID"
  | "INVALID_DESTINATION_HINT"
  | "INVALID_MAX_DURATION"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type RectangularSelectionScreenRecordingError = {
  code: RectangularSelectionScreenRecordingErrorCode;
  message: string;
  boundary: RectangularSelectionScreenRecordingBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RectangularSelectionScreenRecordingPlan = {
  toolId: "computeruse.rectangularSelectionScreenRecording";
  capability: "record-rectangular-selection";
  runtimeId: string;
  invocationId: string;
  displayId: string;
  rectangle: ScreenRecordingRectangle;
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
    guard: "rectangular-screen-recording-approval";
    event: "basicTool.computeruse.rectangularSelectionScreenRecording.planned";
    privacyReviewRequired: true;
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type RectangularSelectionScreenRecordingResult =
  | {
      ok: true;
      plan: RectangularSelectionScreenRecordingPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RectangularSelectionScreenRecordingError;
      events: readonly string[];
    };

export const rectangularSelectionScreenRecordingDescriptor = {
  toolId: "computeruse.rectangularSelectionScreenRecording",
  capability: "record-rectangular-selection",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.computeruseBase.screenRecording",
  defaultDispatch: "dry-run",
  defaultMaxDurationMs: 30_000,
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const DEFAULT_DISPLAY_ID = "primary-display";
const MAX_RECORDING_DURATION_MS = 3_600_000;
const MAX_RECTANGLE_EDGE = 100_000;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RectangularSelectionScreenRecordingErrorCode,
  message: string,
  boundary: RectangularSelectionScreenRecordingBoundary,
): RectangularSelectionScreenRecordingResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.computeruse.rectangularSelectionScreenRecording.rejected"],
  };
}

function normalizeSafeString(
  value: string | undefined,
  defaultValue: string | undefined,
  code: "INVALID_DISPLAY_ID" | "INVALID_RECORDING_ID" | "INVALID_DESTINATION_HINT",
  label: string,
): string | RectangularSelectionScreenRecordingResult | undefined {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes("\0")) {
    return failure(code, `rectangularSelectionScreenRecording ${label} must be a non-empty safe string`, "input");
  }

  return normalized;
}

function normalizeRectangle(
  rectangle: ScreenRecordingRectangle | undefined,
): ScreenRecordingRectangle | RectangularSelectionScreenRecordingResult {
  if (rectangle === undefined) {
    return failure("MISSING_RECTANGLE", "rectangularSelectionScreenRecording requires rectangle", "input");
  }

  const { x, y, width, height } = rectangle;
  const coordinates = [x, y, width, height];
  const valid = coordinates.every((value) => Number.isInteger(value) && Number.isFinite(value));
  const withinBounds =
    Math.abs(x) <= MAX_RECTANGLE_EDGE &&
    Math.abs(y) <= MAX_RECTANGLE_EDGE &&
    width > 0 &&
    height > 0 &&
    width <= MAX_RECTANGLE_EDGE &&
    height <= MAX_RECTANGLE_EDGE;

  if (!valid || !withinBounds) {
    return failure(
      "INVALID_RECTANGLE",
      "rectangularSelectionScreenRecording rectangle must use bounded integer coordinates and positive size",
      "resource",
    );
  }

  return Object.freeze({ x, y, width, height });
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | RectangularSelectionScreenRecordingResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `rectangularSelectionScreenRecording scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function createRecordingId(
  runtimeId: string,
  invocationId: string,
  displayId: string,
  rectangle: ScreenRecordingRectangle,
): string {
  const raw = `${runtimeId}:${invocationId}:${displayId}:${rectangle.x}:${rectangle.y}:${rectangle.width}:${rectangle.height}`;
  return `screen-recording-rect:${raw.replace(/[^a-zA-Z0-9._:-]+/g, "-")}`;
}

export function planRectangularSelectionScreenRecording(
  request: RectangularSelectionScreenRecordingRequest = {},
): RectangularSelectionScreenRecordingResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure(
      "MISSING_RUNTIME_ID",
      "rectangularSelectionScreenRecording requires context.runtimeId for audit",
      "input",
    );
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round rectangularSelectionScreenRecording only supports dry-run planning",
      "governance",
    );
  }

  if (request.permission?.accepted !== true) {
    return failure(
      "PERMISSION_REQUIRED",
      request.permission?.reason ?? "rectangularSelectionScreenRecording requires an approved permission gate",
      "permission",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "rectangularSelectionScreenRecording was rejected by runtime governance",
      "governance",
    );
  }

  const rectangle = normalizeRectangle(request.rectangle);
  if ("ok" in rectangle) {
    return rectangle;
  }

  const maxDurationMs = request.maxDurationMs ?? rectangularSelectionScreenRecordingDescriptor.defaultMaxDurationMs;
  if (!Number.isInteger(maxDurationMs) || maxDurationMs <= 0 || maxDurationMs > MAX_RECORDING_DURATION_MS) {
    return failure(
      "INVALID_MAX_DURATION",
      "rectangularSelectionScreenRecording maxDurationMs must be between 1 and 3600000",
      "resource",
    );
  }

  const displayId = normalizeSafeString(request.displayId, DEFAULT_DISPLAY_ID, "INVALID_DISPLAY_ID", "displayId");
  if (displayId === undefined || typeof displayId !== "string") {
    return displayId ?? failure("INVALID_DISPLAY_ID", "rectangularSelectionScreenRecording displayId is invalid", "input");
  }

  const invocationId = request.context?.invocationId?.trim() || "rectangularSelectionScreenRecording:dry-run";
  const recordingId =
    normalizeSafeString(
      request.recordingId,
      createRecordingId(runtimeId ?? "", invocationId, displayId, rectangle),
      "INVALID_RECORDING_ID",
      "recordingId",
    );
  if (recordingId === undefined || typeof recordingId !== "string") {
    return recordingId ?? failure("INVALID_RECORDING_ID", "rectangularSelectionScreenRecording recordingId is invalid", "input");
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

  const requiredPermissions: RectangularSelectionScreenRecordingPlan["requiredPermissions"] = [
    "screen:record",
    ...(request.includeAudio === true ? (["microphone:record"] as const) : []),
    ...(destinationHint !== undefined ? (["filesystem:write"] as const) : []),
  ];

  return {
    ok: true,
    plan: {
      toolId: "computeruse.rectangularSelectionScreenRecording",
      capability: "record-rectangular-selection",
      runtimeId: runtimeId ?? "",
      invocationId,
      displayId,
      rectangle,
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
        guard: "rectangular-screen-recording-approval",
        event: "basicTool.computeruse.rectangularSelectionScreenRecording.planned",
        privacyReviewRequired: true,
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.computeruse.rectangularSelectionScreenRecording.planned"],
  };
}
