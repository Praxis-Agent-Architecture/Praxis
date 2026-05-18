/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑 / 事件暴露面。
 * 核心目的：承载 UIEvent 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type UIEventBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type UIEventGate = {
  accepted: boolean;
  reason?: string;
};

export type UIEventRequest = {
  runtimeId?: string;
  sessionId?: string;
  eventId?: string;
  kind?: string;
  eventSource?: string;
  payload?: Record<string, unknown>;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  subscribers?: readonly string[];
  runtimeReady?: boolean;
  contract?: UIEventGate;
  governance?: UIEventGate;
};

export type UIEventErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_EVENT_KIND"
  | "MISSING_EVENT_SOURCE"
  | "INVALID_EVENT_PAYLOAD"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type UIEventError = {
  code: UIEventErrorCode;
  message: string;
  boundary: UIEventBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type UIEventRecord = {
  plane: "eventExposurePlane";
  category: "ui";
  runtimeId: string;
  sessionId: string;
  eventId: string;
  kind: string;
  eventSource: string;
  payload: Readonly<Record<string, unknown>>;
  acceptedScopes: readonly string[];
  subscribers: readonly string[];
  visibility: "runtime-subscribable";
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    contractSurface: "runtime.contractSurface";
    governanceRequired: true;
  };
};

export type UIEventExposureResult =
  | {
      ok: true;
      event: UIEventRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      error: UIEventError;
      events: readonly string[];
    };

export const uiEventDescriptor = {
  plane: "eventExposurePlane",
  category: "ui",
  purpose: "expose UI execution events for runtime subscribers without running product UI logic",
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

function failure(code: UIEventErrorCode, message: string, boundary: UIEventBoundary): UIEventExposureResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["eventExposure.ui.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | UIEventExposureResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `UI event scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function exposeUIEvent(request?: UIEventRequest): UIEventExposureResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "UI event exposure requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "UI event exposure requires sessionId", "input");
  }

  if (isBlank(request.kind)) {
    return failure("MISSING_EVENT_KIND", "UI event exposure requires an event kind", "input");
  }

  if (isBlank(request.eventSource)) {
    return failure("MISSING_EVENT_SOURCE", "UI event exposure requires an event source", "input");
  }

  if (request.payload !== undefined && !isRecord(request.payload)) {
    return failure("INVALID_EVENT_PAYLOAD", "UI event payload must be a plain record", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "UI events can only be exposed through a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "UI event exposure was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "UI event exposure was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const kind = request.kind?.trim() ?? "";

  return {
    ok: true,
    event: {
      plane: "eventExposurePlane",
      category: "ui",
      runtimeId,
      sessionId,
      eventId: request.eventId?.trim() || `${runtimeId}:${sessionId}:ui:${kind}`,
      kind,
      eventSource: request.eventSource?.trim() ?? "",
      payload: request.payload ?? {},
      acceptedScopes,
      subscribers: cleanList(request.subscribers),
      visibility: "runtime-subscribable",
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        contractSurface: "runtime.contractSurface",
        governanceRequired: true,
      },
    },
    events: ["eventExposure.ui.exposed"],
  };
}
