/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 视频转换工具。
 * 核心目的：提供 多模态基础工具 / 视频转换工具 中的“生成视频字幕”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type VideoSubtitleGenerationBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type VideoSubtitleGenerationGate = {
  accepted: boolean;
  reason?: string;
};

export type VideoSubtitleFormat = "srt" | "vtt" | "json";

export type VideoSubtitleGenerationContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: VideoSubtitleGenerationGate;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type VideoSubtitleGenerationRequest = {
  context?: VideoSubtitleGenerationContext;
  sourceVideoUri?: string;
  subtitleTrackId?: string;
  language?: string;
  outputFormat?: VideoSubtitleFormat;
  maxSegments?: number;
  includeTimestamps?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type VideoSubtitleGenerationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_VIDEO_URI"
  | "INVALID_VIDEO_URI"
  | "INVALID_SUBTITLE_TRACK_ID"
  | "INVALID_LANGUAGE"
  | "INVALID_OUTPUT_FORMAT"
  | "INVALID_MAX_SEGMENTS"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type VideoSubtitleGenerationError = {
  code: VideoSubtitleGenerationErrorCode;
  message: string;
  boundary: VideoSubtitleGenerationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type VideoSubtitleGenerationPlan = {
  toolId: "omni.videoSubtitleGeneration";
  capability: "generate-video-subtitles";
  runtimeId: string;
  invocationId: string;
  sourceVideoUri: string;
  subtitleTrackId: string;
  language: string;
  outputFormat: VideoSubtitleFormat;
  maxSegments: number;
  includeTimestamps: boolean;
  requiredPermissions: readonly ("video:read" | "subtitle:write:dry-run")[];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldGenerateSubtitleTrack: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "video-subtitle-generation-approval";
    event: "basicTool.omni.videoSubtitleGeneration.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type VideoSubtitleGenerationResult =
  | {
      ok: true;
      plan: VideoSubtitleGenerationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: VideoSubtitleGenerationError;
      events: readonly string[];
    };

export const videoSubtitleGenerationDescriptor = {
  toolId: "omni.videoSubtitleGeneration",
  capability: "generate-video-subtitles",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.videoTransformer",
  defaultDispatch: "dry-run",
  defaultOutputFormat: "vtt",
  unsafeSideEffects: false,
  requiresTapApproval: true,
} as const;

const DEFAULT_MAX_SEGMENTS = 1_000;
const MAX_ALLOWED_SEGMENTS = 10_000;
const SAFE_TEXT_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const SUPPORTED_SUBTITLE_FORMATS: readonly VideoSubtitleFormat[] = ["srt", "vtt", "json"];

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: VideoSubtitleGenerationErrorCode,
  message: string,
  boundary: VideoSubtitleGenerationBoundary,
): VideoSubtitleGenerationResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.omni.videoSubtitleGeneration.rejected"],
  };
}

function normalizeSafeText(
  value: string | undefined,
  fallback: string,
  code: "INVALID_SUBTITLE_TRACK_ID" | "INVALID_LANGUAGE",
  label: string,
): string | VideoSubtitleGenerationResult {
  const normalized = (value ?? fallback).trim();
  if (normalized.length === 0 || normalized.includes("\0") || !SAFE_TEXT_PATTERN.test(normalized)) {
    return failure(code, `videoSubtitleGeneration ${label} must be a safe identifier`, "input");
  }

  return normalized;
}

function normalizeVideoUri(value: string | undefined): string | VideoSubtitleGenerationResult {
  if (typeof value !== "string" || value.trim().length === 0) {
    return failure("MISSING_VIDEO_URI", "videoSubtitleGeneration requires sourceVideoUri", "input");
  }

  const normalized = value.trim();
  if (normalized.includes("\0")) {
    return failure("INVALID_VIDEO_URI", "videoSubtitleGeneration sourceVideoUri must be a safe string", "input");
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | VideoSubtitleGenerationResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `videoSubtitleGeneration scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function planVideoSubtitleGeneration(
  request: VideoSubtitleGenerationRequest = {},
): VideoSubtitleGenerationResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "videoSubtitleGeneration requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round videoSubtitleGeneration only creates a dry-run guard and audit plan",
      "contract",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "videoSubtitleGeneration was rejected by runtime governance",
      "governance",
    );
  }

  const sourceVideoUri = normalizeVideoUri(request.sourceVideoUri);
  if (typeof sourceVideoUri !== "string") {
    return sourceVideoUri;
  }

  const subtitleTrackId = normalizeSafeText(
    request.subtitleTrackId,
    "primary-subtitles",
    "INVALID_SUBTITLE_TRACK_ID",
    "subtitleTrackId",
  );
  if (typeof subtitleTrackId !== "string") {
    return subtitleTrackId;
  }

  const language = normalizeSafeText(request.language, "und", "INVALID_LANGUAGE", "language");
  if (typeof language !== "string") {
    return language;
  }

  const outputFormat = request.outputFormat ?? videoSubtitleGenerationDescriptor.defaultOutputFormat;
  if (!SUPPORTED_SUBTITLE_FORMATS.includes(outputFormat)) {
    return failure("INVALID_OUTPUT_FORMAT", "videoSubtitleGeneration outputFormat must be srt, vtt, or json", "input");
  }

  const maxSegments = request.maxSegments ?? DEFAULT_MAX_SEGMENTS;
  if (!Number.isInteger(maxSegments) || maxSegments <= 0 || maxSegments > MAX_ALLOWED_SEGMENTS) {
    return failure(
      "INVALID_MAX_SEGMENTS",
      "videoSubtitleGeneration maxSegments must be between 1 and 10000",
      "resource",
    );
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const invocationId =
    request.context?.invocationId?.trim() || `${runtimeId}:omni.videoSubtitleGeneration:${subtitleTrackId}`;

  return {
    ok: true,
    plan: {
      toolId: "omni.videoSubtitleGeneration",
      capability: "generate-video-subtitles",
      runtimeId: runtimeId ?? "",
      invocationId,
      sourceVideoUri,
      subtitleTrackId,
      language,
      outputFormat,
      maxSegments,
      includeTimestamps: request.includeTimestamps !== false,
      requiredPermissions: ["video:read", "subtitle:write:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldGenerateSubtitleTrack: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "video-subtitle-generation-approval",
        event: "basicTool.omni.videoSubtitleGeneration.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.omni.videoSubtitleGeneration.planned"],
  };
}
