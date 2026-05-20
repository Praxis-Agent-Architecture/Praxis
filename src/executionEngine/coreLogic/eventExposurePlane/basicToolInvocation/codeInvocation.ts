/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 基础工具调用事件。
 * 核心目的：承载 code Invocation 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CodeInvocationBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type CodeInvocationGate = {
  accepted: boolean;
  reason?: string;
};

export type CodeInvocationRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  operation?: string;
  eventSource?: string;
  languageHint?: string;
  payload?: Record<string, unknown>;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  subscribers?: readonly string[];
  runtimeReady?: boolean;
  dryRun?: boolean;
  contract?: CodeInvocationGate;
  governance?: CodeInvocationGate;
};

export type CodeInvocationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_OPERATION"
  | "MISSING_EVENT_SOURCE"
  | "INVALID_INVOCATION_PAYLOAD"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SIDE_EFFECT_NOT_ALLOWED";

export type CodeInvocationError = {
  code: CodeInvocationErrorCode;
  message: string;
  boundary: CodeInvocationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeInvocationEvent = {
  plane: "eventExposurePlane";
  category: "basic-tool-invocation";
  toolKind: "code";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  operation: string;
  eventSource: string;
  languageHint?: string;
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

export type CodeInvocationExposureResult =
  | {
      ok: true;
      invocation: CodeInvocationEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeInvocationError;
      events: readonly string[];
    };

export const codeInvocationDescriptor = {
  plane: "eventExposurePlane",
  category: "basic-tool-invocation",
  toolKind: "code",
  purpose: "expose code tool invocation events without evaluating or running code",
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
  code: CodeInvocationErrorCode,
  message: string,
  boundary: CodeInvocationBoundary,
): CodeInvocationExposureResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["eventExposure.basicTool.code.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CodeInvocationExposureResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `code invocation scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function exposeCodeInvocationEvent(request?: CodeInvocationRequest): CodeInvocationExposureResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "code invocation exposure requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "code invocation exposure requires sessionId", "input");
  }

  if (isBlank(request.operation)) {
    return failure("MISSING_OPERATION", "code invocation exposure requires an operation", "input");
  }

  if (isBlank(request.eventSource)) {
    return failure("MISSING_EVENT_SOURCE", "code invocation exposure requires an event source", "input");
  }

  if (request.payload !== undefined && !isRecord(request.payload)) {
    return failure("INVALID_INVOCATION_PAYLOAD", "code invocation payload must be a plain record", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round code invocation exposure only supports dry-run envelopes",
      "governance",
    );
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "code invocation events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "code invocation exposure was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code invocation exposure was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const operation = request.operation?.trim() ?? "";

  return {
    ok: true,
    invocation: {
      plane: "eventExposurePlane",
      category: "basic-tool-invocation",
      toolKind: "code",
      runtimeId,
      sessionId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:${sessionId}:code:${operation}`,
      operation,
      eventSource: request.eventSource?.trim() ?? "",
      languageHint: request.languageHint?.trim() || undefined,
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
    events: ["eventExposure.basicTool.code.exposed"],
  };
}
