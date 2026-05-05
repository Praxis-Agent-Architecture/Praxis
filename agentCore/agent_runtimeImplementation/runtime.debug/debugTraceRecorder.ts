/*
 * 文件定位：Agent 运行态实现层 / 调试面。
 * 核心目的：承载 debug Trace Recorder 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type DebugTraceBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope" | "trace";

export type DebugTraceCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "test";

export type DebugTraceCaller = {
  kind: DebugTraceCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type DebugTraceGate = {
  accepted: boolean;
  reason?: string;
};

export type DebugTraceSeverity = "info" | "warning" | "error";

export type DebugTraceEventInput = {
  eventId?: string;
  at?: string;
  kind?: string;
  source?: string;
  summary?: string;
  severity?: DebugTraceSeverity;
  payload?: Readonly<Record<string, unknown>>;
  tags?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type DebugTraceRecord = {
  eventId: string;
  at: string;
  kind: string;
  source: string;
  summary?: string;
  severity: DebugTraceSeverity;
  payloadKeys: readonly string[];
  tags: readonly string[];
  metadataKeys: readonly string[];
};

export type DebugTraceSnapshot = {
  runtimeId: string;
  traceId: string;
  caller: DebugTraceCaller;
  route: "runtime.debug.debugTraceRecorder";
  records: readonly DebugTraceRecord[];
  eventKinds: readonly string[];
  eventSources: readonly string[];
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    rawPayloadStored: false;
    governanceRequired: true;
  };
};

export type DebugTraceRecorderRequest = {
  runtimeId?: string;
  traceId?: string;
  caller?: DebugTraceCaller;
  events?: readonly DebugTraceEventInput[];
  allowedEventKinds?: readonly string[];
  maxEvents?: number;
  runtimeReady?: boolean;
  contract?: DebugTraceGate;
  governance?: DebugTraceGate;
};

export type DebugTraceErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_EVENTS"
  | "MISSING_EVENT_KIND"
  | "MISSING_EVENT_SOURCE"
  | "EVENT_SCOPE_DENIED"
  | "TRACE_EVENT_LIMIT_EXCEEDED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type DebugTraceError = {
  code: DebugTraceErrorCode;
  message: string;
  boundary: DebugTraceBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type DebugTraceRecorderResult =
  | {
      ok: true;
      trace: DebugTraceSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: DebugTraceError;
      events: readonly string[];
    };

export const debugTraceRecorderDescriptor = {
  surface: "runtime.debug",
  capability: "debugTraceRecorder",
  purpose: "record public-safe runtime debug trace envelopes without executing adjacent modules",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: DebugTraceCaller): DebugTraceCaller {
  const normalized: DebugTraceCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function failure(
  code: DebugTraceErrorCode,
  message: string,
  boundary: DebugTraceBoundary,
): DebugTraceRecorderResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.debug.traceRecorder.rejected"],
  };
}

function normalizeTraceEvent(
  event: DebugTraceEventInput,
  index: number,
  traceId: string,
  allowedEventKinds: readonly string[],
): DebugTraceRecord | DebugTraceRecorderResult {
  const kind = event.kind?.trim();
  if (!hasText(kind)) {
    return failure("MISSING_EVENT_KIND", "debug trace recorder requires every event to declare a kind", "input");
  }

  if (allowedEventKinds.length > 0 && !allowedEventKinds.includes(kind)) {
    return failure("EVENT_SCOPE_DENIED", `debug trace event kind ${kind} is outside runtime debug scope`, "scope");
  }

  const source = event.source?.trim();
  if (!hasText(source)) {
    return failure("MISSING_EVENT_SOURCE", "debug trace recorder requires every event to declare a source", "input");
  }

  const summary = event.summary?.trim();

  return {
    eventId: event.eventId?.trim() || `${traceId}:event:${index + 1}:${kind}`,
    at: event.at?.trim() || "unobserved",
    kind,
    source,
    summary: summary && summary.length > 0 ? summary : undefined,
    severity: event.severity ?? "info",
    payloadKeys: Object.keys(event.payload ?? {}).sort(),
    tags: cleanList(event.tags),
    metadataKeys: Object.keys(event.metadata ?? {}).sort(),
  };
}

export function recordDebugTrace(request?: DebugTraceRecorderRequest): DebugTraceRecorderResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "debug trace recorder requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "debug trace recorder requires an application, module, or runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "debug traces can only be recorded through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "debug trace recording was rejected by contract", "contract");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "debug trace recording was rejected by governance",
      "governance",
    );
  }

  const events = request.events ?? [];
  if (events.length === 0) {
    return failure("MISSING_EVENTS", "debug trace recorder requires at least one runtime debug event", "input");
  }

  if (request.maxEvents !== undefined && events.length > request.maxEvents) {
    return failure("TRACE_EVENT_LIMIT_EXCEEDED", "debug trace event count exceeds the requested limit", "trace");
  }

  const runtimeId = request.runtimeId.trim();
  const traceId = request.traceId?.trim() || `${runtimeId}:debugTrace`;
  const allowedEventKinds = cleanList(request.allowedEventKinds);
  const records: DebugTraceRecord[] = [];

  for (const [index, event] of events.entries()) {
    const normalized = normalizeTraceEvent(event, index, traceId, allowedEventKinds);
    if ("ok" in normalized) {
      return normalized;
    }

    records.push(normalized);
  }

  return {
    ok: true,
    trace: {
      runtimeId,
      traceId,
      caller: normalizeCaller(request.caller),
      route: "runtime.debug.debugTraceRecorder",
      records,
      eventKinds: cleanList(records.map((record) => record.kind)),
      eventSources: cleanList(records.map((record) => record.source)),
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        rawPayloadStored: false,
        governanceRequired: true,
      },
    },
    events: ["runtime.debug.traceRecorder.recorded"],
  };
}
