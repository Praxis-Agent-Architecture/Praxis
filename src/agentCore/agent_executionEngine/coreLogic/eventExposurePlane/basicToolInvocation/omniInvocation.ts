/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 基础工具调用事件。
 * 核心目的：承载 omni Invocation 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OmniInvocationBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type OmniInvocationSource = "mainLoop" | "stateEngine" | "basicToolLayer" | "officialModuleBridge" | "runtime";

export type OmniInvocationModality = "text" | "image" | "audio" | "video" | "mixed";

export type OmniInvocationGate = {
  accepted: boolean;
  reason?: string;
};

export type OmniInvocationTrace = {
  correlationId?: string;
  callerId?: string;
};

export type OmniInvocationRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  source?: OmniInvocationSource;
  modality?: OmniInvocationModality;
  targetId?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: OmniInvocationGate;
  governance?: OmniInvocationGate;
  trace?: OmniInvocationTrace;
  emittedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type OmniInvocationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_INVOCATION_ID"
  | "MISSING_EVENT_SOURCE"
  | "MISSING_OMNI_TARGET"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type OmniInvocationError = {
  code: OmniInvocationErrorCode;
  message: string;
  boundary: OmniInvocationBoundary;
  safeForRuntimeInspection: true;
};

export type OmniInvocationEvent = {
  eventId: string;
  kind: "basicToolInvocation.omni";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  source: OmniInvocationSource;
  omni: {
    modality: OmniInvocationModality;
    targetId: string;
  };
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  trace: OmniInvocationTrace;
  emittedAt: string;
  route: "runtime.execEngine.eventExposurePlane";
  dispatch: "dry-run";
  unsafeSideEffects: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type OmniInvocationResult =
  | {
      ok: true;
      event: OmniInvocationEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OmniInvocationError;
      events: readonly string[];
    };

export const omniInvocationDescriptor = {
  kind: "basicToolInvocation.omni",
  route: "runtime.execEngine.eventExposurePlane",
  purpose: "expose multimodal basic tool invocation events without processing media",
  dispatch: "dry-run",
  unsafeSideEffects: false,
} as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: OmniInvocationErrorCode,
  message: string,
  boundary: OmniInvocationBoundary,
): OmniInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["basicToolInvocation.omni.rejected"],
  };
}

function resolveGrantedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | OmniInvocationResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0 || allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `Omni invocation scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function exposeOmniInvocationEvent(request?: OmniInvocationRequest): OmniInvocationResult {
  if (request === undefined) {
    return failure("MISSING_RUNTIME_ID", "Omni invocation event requires runtimeId", "input");
  }

  const runtimeId = request.runtimeId?.trim();
  const sessionId = request.sessionId?.trim();
  const invocationId = request.invocationId?.trim();
  const source = request.source;
  const targetId = request.targetId?.trim();

  if (!runtimeId) {
    return failure("MISSING_RUNTIME_ID", "Omni invocation event requires runtimeId", "input");
  }

  if (!sessionId) {
    return failure("MISSING_SESSION_ID", "Omni invocation event requires sessionId", "input");
  }

  if (!invocationId) {
    return failure("MISSING_INVOCATION_ID", "Omni invocation event requires invocationId", "input");
  }

  if (source === undefined) {
    return failure("MISSING_EVENT_SOURCE", "Omni invocation event requires an execution event source", "input");
  }

  if (request.modality === undefined || !targetId) {
    return failure("MISSING_OMNI_TARGET", "Omni invocation event requires modality and targetId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "Omni invocation events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the Omni invocation event",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the Omni invocation event",
      "governance",
    );
  }

  const grantedScopes = resolveGrantedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in grantedScopes) {
    return grantedScopes;
  }

  const trace: OmniInvocationTrace = {
    correlationId: request.trace?.correlationId?.trim() || undefined,
    callerId: request.trace?.callerId?.trim() || undefined,
  };

  return {
    ok: true,
    event: {
      eventId: `${runtimeId}:${sessionId}:${invocationId}:omni:${request.modality}:${targetId}`,
      kind: "basicToolInvocation.omni",
      runtimeId,
      sessionId,
      invocationId,
      source,
      omni: { modality: request.modality, targetId },
      requestedScopes: cleanList(request.requestedScopes),
      grantedScopes,
      trace,
      emittedAt: request.emittedAt?.trim() || "dry-run",
      route: "runtime.execEngine.eventExposurePlane",
      dispatch: "dry-run",
      unsafeSideEffects: false,
      metadata: request.metadata ?? {},
    },
    events: ["basicToolInvocation.omni.exposed"],
  };
}
