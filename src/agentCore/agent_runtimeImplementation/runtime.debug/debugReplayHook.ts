/*
 * 文件定位：Agent 运行态实现层 / 调试面。
 * 核心目的：承载 debug Replay Hook 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type DebugReplayHookBoundary = "input" | "contract" | "governance" | "runtime-state" | "replay";

export type DebugReplayHookCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "debug";

export type DebugReplayHookCaller = {
  kind: DebugReplayHookCallerKind;
  id: string;
  moduleId?: string;
};

export type DebugReplayHookGate = {
  accepted: boolean;
  reason?: string;
};

export type DebugReplayHookMode = "dry-run" | "plan";

export type DebugReplayFrame = {
  frameId: string;
  eventType: string;
  timestamp?: string;
  payloadSummary?: string;
  dependsOnFrameIds?: readonly string[];
};

export type DebugReplayHookErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_REPLAY_ID"
  | "MISSING_REPLAY_FRAMES"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "UNSAFE_REPLAY_MODE"
  | "REPLAY_FRAME_INVALID";

export type DebugReplayHookRequest = {
  runtimeId?: string;
  caller?: DebugReplayHookCaller;
  replayId?: string;
  mode?: DebugReplayHookMode | string;
  runtimeReady?: boolean;
  contract?: DebugReplayHookGate;
  governance?: DebugReplayHookGate;
  frames?: readonly DebugReplayFrame[];
  allowUnsafeReplay?: boolean;
};

export type DebugReplayPlan = {
  runtimeId: string;
  replayId: string;
  caller: DebugReplayHookCaller;
  mode: DebugReplayHookMode;
  frames: readonly DebugReplayFrame[];
  frameCount: number;
  dispatch: "dry-run";
  sideEffectPolicy: "blocked";
  replayable: true;
  probeSurface: "runtime.debug.debugReplayHook";
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type DebugReplayHookError = {
  code: DebugReplayHookErrorCode;
  message: string;
  boundary: DebugReplayHookBoundary;
  publicSafe: true;
};

export type DebugReplayHookResult =
  | {
      ok: true;
      plan: DebugReplayPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DebugReplayHookError;
      events: readonly string[];
    };

const replayHookModes = new Set<string>(["dry-run", "plan"]);

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: DebugReplayHookCaller): DebugReplayHookCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
  };
}

function normalizeFrame(frame: DebugReplayFrame): DebugReplayFrame {
  return {
    frameId: frame.frameId.trim(),
    eventType: frame.eventType.trim(),
    timestamp: frame.timestamp?.trim() || undefined,
    payloadSummary: frame.payloadSummary?.trim() || undefined,
    dependsOnFrameIds: cleanList(frame.dependsOnFrameIds),
  };
}

function failure(
  code: DebugReplayHookErrorCode,
  message: string,
  boundary: DebugReplayHookBoundary,
): DebugReplayHookResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.debug.replayHook.rejected"],
  };
}

export function planDebugReplayHook(request: DebugReplayHookRequest = {}): DebugReplayHookResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "debug replay hook requires a runtimeId", "input");
  }

  if (request.caller === undefined || isBlank(request.caller.id)) {
    return failure("MISSING_CALLER", "debug replay hook requires a caller with a stable id", "input");
  }

  if (isBlank(request.replayId)) {
    return failure("MISSING_REPLAY_ID", "debug replay hook requires a replayId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "debug replay hook can only plan against a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "debug replay hook was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "debug replay hook was rejected by governance",
      "governance",
    );
  }

  if (request.allowUnsafeReplay === true) {
    return failure("UNSAFE_REPLAY_MODE", "debug replay hook only supports guarded dry-run planning", "replay");
  }

  const mode = request.mode ?? "dry-run";
  if (!replayHookModes.has(mode)) {
    return failure("UNSAFE_REPLAY_MODE", `debug replay hook does not execute replay mode: ${mode}`, "replay");
  }

  if (request.frames === undefined || request.frames.length === 0) {
    return failure("MISSING_REPLAY_FRAMES", "debug replay hook requires at least one replay frame", "input");
  }

  const frames = request.frames.map(normalizeFrame);
  const invalidFrame = frames.find((frame) => isBlank(frame.frameId) || isBlank(frame.eventType));
  if (invalidFrame !== undefined) {
    return failure("REPLAY_FRAME_INVALID", "debug replay hook received a frame without frameId or eventType", "replay");
  }

  return {
    ok: true,
    plan: {
      runtimeId: (request.runtimeId ?? "").trim(),
      replayId: (request.replayId ?? "").trim(),
      caller: normalizeCaller(request.caller),
      mode: mode as DebugReplayHookMode,
      frames,
      frameCount: frames.length,
      dispatch: "dry-run",
      sideEffectPolicy: "blocked",
      replayable: true,
      probeSurface: "runtime.debug.debugReplayHook",
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.debug.replayHook.planned"],
  };
}
