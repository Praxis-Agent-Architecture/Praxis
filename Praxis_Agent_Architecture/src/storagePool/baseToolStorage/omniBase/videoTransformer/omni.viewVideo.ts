/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 视频转换工具。
 * 核心目的：提供 多模态基础工具 / 视频转换工具 中的“查看视频”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ViewVideoBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type ViewVideoGate = {
  accepted: boolean;
  reason?: string;
};

export type ViewVideoMode = "metadata" | "timeline" | "frame-sample";

export type ViewVideoContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: ViewVideoGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ViewVideoRequest = {
  context?: ViewVideoContext;
  sourceVideoUri?: string;
  mode?: ViewVideoMode;
  startMs?: number;
  endMs?: number;
  frameSampleCount?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ViewVideoErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_VIDEO_URI"
  | "INVALID_VIDEO_URI"
  | "INVALID_TIME_RANGE"
  | "INVALID_FRAME_SAMPLE_COUNT"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type ViewVideoError = {
  code: ViewVideoErrorCode;
  message: string;
  boundary: ViewVideoBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ViewVideoPlan = {
  toolId: "omni.viewVideo";
  capability: "view-video";
  runtimeId: string;
  invocationId: string;
  sourceVideoUri: string;
  mode: ViewVideoMode;
  timeRangeMs?: {
    start: number;
    end: number;
  };
  frameSampleCount: number;
  requiredPermissions: readonly ["video:read"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldInspectVideo: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  previewEnvelope: {
    metadataRead: false;
    framesDecoded: 0;
    transcriptGenerated: false;
  };
  audit: {
    guard: "video-view-approval";
    event: "basicTool.omni.viewVideo.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ViewVideoResult =
  | {
      ok: true;
      plan: ViewVideoPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ViewVideoError;
      events: readonly string[];
    };

export const viewVideoDescriptor = {
  toolId: "omni.viewVideo",
  capability: "view-video",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  defaultDispatch: "dry-run",
  defaultMode: "metadata",
  unsafeSideEffects: false,
  requiresTapApproval: true,
} as const;

const DEFAULT_FRAME_SAMPLE_COUNT = 1;
const MAX_FRAME_SAMPLE_COUNT = 120;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: ViewVideoErrorCode, message: string, boundary: ViewVideoBoundary): ViewVideoResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.omni.viewVideo.rejected"],
  };
}

function normalizeVideoUri(value: string | undefined): string | ViewVideoResult {
  if (typeof value !== "string" || value.trim().length === 0) {
    return failure("MISSING_VIDEO_URI", "viewVideo requires sourceVideoUri", "input");
  }

  const normalized = value.trim();
  if (normalized.includes("\0")) {
    return failure("INVALID_VIDEO_URI", "viewVideo sourceVideoUri must be a safe string", "input");
  }

  return normalized;
}

function normalizeTimeRange(startMs: number | undefined, endMs: number | undefined): ViewVideoPlan["timeRangeMs"] | ViewVideoResult {
  if (startMs === undefined && endMs === undefined) {
    return undefined;
  }

  if (
    startMs === undefined ||
    endMs === undefined ||
    !Number.isInteger(startMs) ||
    !Number.isInteger(endMs) ||
    startMs < 0 ||
    endMs <= startMs
  ) {
    return failure("INVALID_TIME_RANGE", "viewVideo time range must use non-negative integer ms with end > start", "input");
  }

  return {
    start: startMs,
    end: endMs,
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ViewVideoResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `viewVideo scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planViewVideo(request: ViewVideoRequest = {}): ViewVideoResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "viewVideo requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round viewVideo only creates a dry-run inspection plan",
      "contract",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "viewVideo was rejected by runtime governance",
      "governance",
    );
  }

  const sourceVideoUri = normalizeVideoUri(request.sourceVideoUri);
  if (typeof sourceVideoUri !== "string") {
    return sourceVideoUri;
  }

  const timeRangeMs = normalizeTimeRange(request.startMs, request.endMs);
  if (timeRangeMs !== undefined && "ok" in timeRangeMs) {
    return timeRangeMs;
  }

  const frameSampleCount = request.frameSampleCount ?? DEFAULT_FRAME_SAMPLE_COUNT;
  if (!Number.isInteger(frameSampleCount) || frameSampleCount <= 0 || frameSampleCount > MAX_FRAME_SAMPLE_COUNT) {
    return failure(
      "INVALID_FRAME_SAMPLE_COUNT",
      "viewVideo frameSampleCount must be between 1 and 120",
      "resource",
    );
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const invocationId = request.context?.invocationId?.trim() || `${runtimeId}:omni.viewVideo`;

  return {
    ok: true,
    plan: {
      toolId: "omni.viewVideo",
      capability: "view-video",
      runtimeId: runtimeId ?? "",
      invocationId,
      sourceVideoUri,
      mode: request.mode ?? viewVideoDescriptor.defaultMode,
      timeRangeMs,
      frameSampleCount,
      requiredPermissions: ["video:read"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldInspectVideo: true,
      unsafeSideEffects: false,
      acceptedScopes,
      previewEnvelope: {
        metadataRead: false,
        framesDecoded: 0,
        transcriptGenerated: false,
      },
      audit: {
        guard: "video-view-approval",
        event: "basicTool.omni.viewVideo.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.omni.viewVideo.planned"],
  };
}
