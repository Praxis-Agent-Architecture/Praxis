/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 多模态基础工具 / 音频转换工具。
 * 核心目的：提供 多模态基础工具 / 音频转换工具 中的“听取音频”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ListenAudioBoundary = "input" | "contract" | "governance" | "scope" | "resource";

export type ListenAudioGate = {
  accepted: boolean;
  reason?: string;
};

export type ListenAudioObservationMode = "speech-transcript" | "sound-event-summary" | "metadata-only";

export type ListenAudioRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  audioRef?: string;
  observationMode?: ListenAudioObservationMode;
  localeHint?: string;
  maxDurationSeconds?: number;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: ListenAudioGate;
  governance?: ListenAudioGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ListenAudioErrorCode =
  | "MISSING_AUDIO_REF"
  | "INVALID_DURATION_LIMIT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type ListenAudioError = {
  code: ListenAudioErrorCode;
  message: string;
  boundary: ListenAudioBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ListenAudioPlan = {
  tool: "omni.listenAudio";
  capability: "listen-audio";
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  audioRef: string;
  observationMode: ListenAudioObservationMode;
  localeHint?: string;
  maxDurationSeconds: number;
  requiredPermission: "omni:audio:listen";
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldAnalyzeAudio: true;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  audit: {
    guard: "audio-reference-scope-and-dry-run";
    event: "basicTool.omni.listenAudio.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ListenAudioResult =
  | {
      ok: true;
      plan: ListenAudioPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ListenAudioError;
      events: readonly string[];
    };

export const listenAudioDescriptor = {
  tool: "omni.listenAudio",
  capability: "listen-audio",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.omniBase.audioTransformer",
  defaultDispatch: "dry-run",
  requiresTapApproval: true,
  unsafeSideEffects: false,
} as const;

const defaultMaxDurationSeconds = 600;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: ListenAudioErrorCode, message: string, boundary: ListenAudioBoundary): ListenAudioResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.omni.listenAudio.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ListenAudioResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `omni.listenAudio scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function planListenAudio(request: ListenAudioRequest = {}): ListenAudioResult {
  if (isBlank(request.audioRef)) {
    return failure("MISSING_AUDIO_REF", "omni.listenAudio requires an audioRef to inspect", "input");
  }

  const maxDurationSeconds = request.maxDurationSeconds ?? defaultMaxDurationSeconds;
  if (!Number.isFinite(maxDurationSeconds) || maxDurationSeconds <= 0) {
    return failure("INVALID_DURATION_LIMIT", "omni.listenAudio maxDurationSeconds must be positive", "resource");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round omni.listenAudio only returns a dry-run listening plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "omni.listenAudio was rejected by runtime contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "omni.listenAudio was rejected by runtime governance",
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
      tool: "omni.listenAudio",
      capability: "listen-audio",
      runtimeId: request.runtimeId?.trim() || undefined,
      sessionId: request.sessionId?.trim() || undefined,
      invocationId: request.invocationId?.trim() || undefined,
      audioRef: request.audioRef?.trim() ?? "",
      observationMode: request.observationMode ?? "speech-transcript",
      localeHint: request.localeHint?.trim() || undefined,
      maxDurationSeconds,
      requiredPermission: "omni:audio:listen",
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldAnalyzeAudio: true,
      unsafeSideEffects: false,
      acceptedScopes,
      audit: {
        guard: "audio-reference-scope-and-dry-run",
        event: "basicTool.omni.listenAudio.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["basicTool.omni.listenAudio.planned"],
  };
}
