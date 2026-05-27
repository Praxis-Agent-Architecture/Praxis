/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 基础工具调用事件。
 * 核心目的：承载 media Invocation 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MediaInvocationBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type MediaInvocationSource = "mainLoop" | "stateEngine" | "basicToolLayer" | "officialModuleBridge" | "runtime";

export type MediaInvocationModality = "text" | "image" | "audio" | "video" | "mixed";

export type MediaInvocationGate = {
  accepted: boolean;
  reason?: string;
};

export type MediaInvocationTrace = {
  correlationId?: string;
  callerId?: string;
};

export type MediaInvocationRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  source?: MediaInvocationSource;
  modality?: MediaInvocationModality;
  targetId?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: MediaInvocationGate;
  governance?: MediaInvocationGate;
  trace?: MediaInvocationTrace;
  emittedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MediaInvocationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_INVOCATION_ID"
  | "MISSING_EVENT_SOURCE"
  | "MISSING_MEDIA_TARGET"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type MediaInvocationError = {
  code: MediaInvocationErrorCode;
  message: string;
  boundary: MediaInvocationBoundary;
  safeForRuntimeInspection: true;
};

export type MediaInvocationEvent = {
  eventId: string;
  kind: "basicToolInvocation.media";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  source: MediaInvocationSource;
  media: {
    modality: MediaInvocationModality;
    targetId: string;
  };
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  trace: MediaInvocationTrace;
  emittedAt: string;
  route: "runtime.execEngine.eventExposurePlane";
  dispatch: "dry-run";
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type MediaInvocationResult =
  | {
      ok: true;
      event: MediaInvocationEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MediaInvocationError;
      events: readonly string[];
    };

export const mediaInvocationDescriptor = {
  kind: "basicToolInvocation.media",
  route: "runtime.execEngine.eventExposurePlane",
  purpose: "expose media basic tool invocation events without processing media",
  dispatch: "dry-run",
  unsafeSideEffects: false,
} as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: MediaInvocationErrorCode,
  message: string,
  boundary: MediaInvocationBoundary,
): MediaInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["basicToolInvocation.media.rejected"],
  };
}

function resolveGrantedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | MediaInvocationResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `Media invocation scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function exposeMediaInvocationEvent(request?: MediaInvocationRequest): MediaInvocationResult {
  if (request === undefined) {
    return failure("MISSING_RUNTIME_ID", "Media invocation event requires runtimeId", "input");
  }

  const runtimeId = request.runtimeId?.trim();
  const sessionId = request.sessionId?.trim();
  const invocationId = request.invocationId?.trim();
  const source = request.source;
  const targetId = request.targetId?.trim();

  if (!runtimeId) {
    return failure("MISSING_RUNTIME_ID", "Media invocation event requires runtimeId", "input");
  }

  if (!sessionId) {
    return failure("MISSING_SESSION_ID", "Media invocation event requires sessionId", "input");
  }

  if (!invocationId) {
    return failure("MISSING_INVOCATION_ID", "Media invocation event requires invocationId", "input");
  }

  if (source === undefined) {
    return failure("MISSING_EVENT_SOURCE", "Media invocation event requires an execution event source", "input");
  }

  if (request.modality === undefined || !targetId) {
    return failure("MISSING_MEDIA_TARGET", "Media invocation event requires modality and targetId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "Media invocation events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the Media invocation event",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the Media invocation event",
      "governance",
    );
  }

  const grantedScopes = resolveGrantedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in grantedScopes) {
    return grantedScopes;
  }

  const trace: MediaInvocationTrace = {
    correlationId: request.trace?.correlationId?.trim() || undefined,
    callerId: request.trace?.callerId?.trim() || undefined,
  };

  return {
    ok: true,
    event: {
      eventId: `${runtimeId}:${sessionId}:${invocationId}:media:${request.modality}:${targetId}`,
      kind: "basicToolInvocation.media",
      runtimeId,
      sessionId,
      invocationId,
      source,
      media: { modality: request.modality, targetId },
      requestedScopes: cleanList(request.requestedScopes),
      grantedScopes,
      trace,
      emittedAt: request.emittedAt?.trim() || "dry-run",
      route: "runtime.execEngine.eventExposurePlane",
      dispatch: "dry-run",
      unsafeSideEffects: false,
      metadata: request.metadata ?? {},
    },
    events: ["basicToolInvocation.media.exposed"],
  };
}
