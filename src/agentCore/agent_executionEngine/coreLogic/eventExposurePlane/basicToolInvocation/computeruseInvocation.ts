/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 基础工具调用事件。
 * 核心目的：承载 computeruse Invocation 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ComputeruseInvocationBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type ComputeruseInvocationGate = {
  accepted: boolean;
  reason?: string;
};

export type ComputeruseInvocationRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  action?: string;
  eventSource?: string;
  surfaceHint?: string;
  payload?: Record<string, unknown>;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  subscribers?: readonly string[];
  runtimeReady?: boolean;
  dryRun?: boolean;
  contract?: ComputeruseInvocationGate;
  governance?: ComputeruseInvocationGate;
};

export type ComputeruseInvocationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_ACTION"
  | "MISSING_EVENT_SOURCE"
  | "INVALID_INVOCATION_PAYLOAD"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type ComputeruseInvocationError = {
  code: ComputeruseInvocationErrorCode;
  message: string;
  boundary: ComputeruseInvocationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ComputeruseInvocationEvent = {
  plane: "eventExposurePlane";
  category: "basic-tool-invocation";
  toolKind: "computeruse";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  action: string;
  eventSource: string;
  surfaceHint?: string;
  payload: Readonly<Record<string, unknown>>;
  acceptedScopes: readonly string[];
  subscribers: readonly string[];
  execution: {
    dryRun: true;
    invoked: false;
    unsafeSideEffects: false;
  };
  audit: {
    contractSurface: "runtime.contractSurface";
    governanceRequired: true;
  };
};

export type ComputeruseInvocationExposureResult =
  | {
      ok: true;
      invocation: ComputeruseInvocationEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ComputeruseInvocationError;
      events: readonly string[];
    };

export const computeruseInvocationDescriptor = {
  plane: "eventExposurePlane",
  category: "basic-tool-invocation",
  toolKind: "computeruse",
  purpose: "expose computer use tool invocation events without operating the desktop",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ComputeruseInvocationErrorCode,
  message: string,
  boundary: ComputeruseInvocationBoundary,
): ComputeruseInvocationExposureResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["eventExposure.basicTool.computeruse.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ComputeruseInvocationExposureResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `computer use invocation scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

export function exposeComputeruseInvocationEvent(
  request?: ComputeruseInvocationRequest,
): ComputeruseInvocationExposureResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "computer use invocation exposure requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "computer use invocation exposure requires sessionId", "input");
  }

  if (isBlank(request.action)) {
    return failure("MISSING_ACTION", "computer use invocation exposure requires an action", "input");
  }

  if (isBlank(request.eventSource)) {
    return failure("MISSING_EVENT_SOURCE", "computer use invocation exposure requires an event source", "input");
  }

  if (request.payload !== undefined && !isRecord(request.payload)) {
    return failure("INVALID_INVOCATION_PAYLOAD", "computer use invocation payload must be a plain record", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round computer use invocation exposure only supports dry-run envelopes",
      "governance",
    );
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "computer use invocation events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "computer use invocation exposure was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "computer use invocation exposure was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const action = request.action?.trim() ?? "";

  return {
    ok: true,
    invocation: {
      plane: "eventExposurePlane",
      category: "basic-tool-invocation",
      toolKind: "computeruse",
      runtimeId,
      sessionId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:${sessionId}:computeruse:${action}`,
      action,
      eventSource: request.eventSource?.trim() ?? "",
      surfaceHint: request.surfaceHint?.trim() || undefined,
      payload: request.payload ?? {},
      acceptedScopes,
      subscribers: cleanList(request.subscribers),
      execution: {
        dryRun: true,
        invoked: false,
        unsafeSideEffects: false,
      },
      audit: {
        contractSurface: "runtime.contractSurface",
        governanceRequired: true,
      },
    },
    events: ["eventExposure.basicTool.computeruse.exposed"],
  };
}
