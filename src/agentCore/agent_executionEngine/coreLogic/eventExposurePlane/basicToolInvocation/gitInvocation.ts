/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面 / 基础工具调用事件。
 * 核心目的：承载 git Invocation 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type GitInvocationBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type GitInvocationGate = {
  accepted: boolean;
  reason?: string;
};

export type GitInvocationRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  operation?: string;
  eventSource?: string;
  repositoryHint?: string;
  payload?: Record<string, unknown>;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  subscribers?: readonly string[];
  runtimeReady?: boolean;
  dryRun?: boolean;
  contract?: GitInvocationGate;
  governance?: GitInvocationGate;
};

export type GitInvocationErrorCode =
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

export type GitInvocationError = {
  code: GitInvocationErrorCode;
  message: string;
  boundary: GitInvocationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type GitInvocationEvent = {
  plane: "eventExposurePlane";
  category: "basic-tool-invocation";
  toolKind: "git";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  operation: string;
  eventSource: string;
  repositoryHint?: string;
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

export type GitInvocationExposureResult =
  | {
      ok: true;
      invocation: GitInvocationEvent;
      events: readonly string[];
    }
  | {
      ok: false;
      error: GitInvocationError;
      events: readonly string[];
    };

export const gitInvocationDescriptor = {
  plane: "eventExposurePlane",
  category: "basic-tool-invocation",
  toolKind: "git",
  purpose: "expose git tool invocation events without running git commands",
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
  code: GitInvocationErrorCode,
  message: string,
  boundary: GitInvocationBoundary,
): GitInvocationExposureResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["eventExposure.basicTool.git.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | GitInvocationExposureResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `git invocation scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function exposeGitInvocationEvent(request?: GitInvocationRequest): GitInvocationExposureResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "git invocation exposure requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "git invocation exposure requires sessionId", "input");
  }

  if (isBlank(request.operation)) {
    return failure("MISSING_OPERATION", "git invocation exposure requires an operation", "input");
  }

  if (isBlank(request.eventSource)) {
    return failure("MISSING_EVENT_SOURCE", "git invocation exposure requires an event source", "input");
  }

  if (request.payload !== undefined && !isRecord(request.payload)) {
    return failure("INVALID_INVOCATION_PAYLOAD", "git invocation payload must be a plain record", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_SIDE_EFFECT_NOT_ALLOWED",
      "first-round git invocation exposure only supports dry-run envelopes",
      "governance",
    );
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "git invocation events require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "git invocation exposure was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "git invocation exposure was rejected by runtime governance",
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
      toolKind: "git",
      runtimeId,
      sessionId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:${sessionId}:git:${operation}`,
      operation,
      eventSource: request.eventSource?.trim() ?? "",
      repositoryHint: request.repositoryHint?.trim() || undefined,
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
    events: ["eventExposure.basicTool.git.exposed"],
  };
}
