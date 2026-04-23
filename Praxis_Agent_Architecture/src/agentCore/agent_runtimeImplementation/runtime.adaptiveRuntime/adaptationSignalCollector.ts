/*
 * 文件定位：Agent 运行态实现层 / 自适应运行面。
 * 核心目的：承载 adaptation Signal Collector 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AdaptationSignalBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type AdaptationSignalCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "test";

export type AdaptationSignalCaller = {
  kind: AdaptationSignalCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type AdaptationSignalGate = {
  accepted: boolean;
  reason?: string;
};

export type AdaptationSignalKind =
  | "latency"
  | "cost"
  | "quality"
  | "error-rate"
  | "resource-pressure"
  | "provider-health"
  | "module-load"
  | (string & {});

export type AdaptationSignalInput = {
  signalId?: string;
  kind?: AdaptationSignalKind;
  source?: string;
  value?: number | string | boolean;
  weight?: number;
  tags?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type AdaptationSignalErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_SIGNALS"
  | "MISSING_SIGNAL_KIND"
  | "MISSING_SIGNAL_SOURCE"
  | "INVALID_SIGNAL_WEIGHT"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SIGNAL_SCOPE_DENIED";

export type AdaptationSignalError = {
  code: AdaptationSignalErrorCode;
  message: string;
  boundary: AdaptationSignalBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type AdaptationSignalRecord = {
  signalId: string;
  kind: AdaptationSignalKind;
  source: string;
  value?: number | string | boolean;
  weight: number;
  tags: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type AdaptationSignalSnapshot = {
  runtimeId: string;
  collectorId: string;
  caller: AdaptationSignalCaller;
  route: "runtime.adaptiveRuntime.adaptationSignalCollector";
  signals: readonly AdaptationSignalRecord[];
  signalKinds: readonly AdaptationSignalKind[];
  signalSources: readonly string[];
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    contractSurface: "runtime.contractSurface";
    governanceRequired: true;
  };
};

export type AdaptationSignalCollectRequest = {
  runtimeId?: string;
  collectorId?: string;
  caller?: AdaptationSignalCaller;
  signals?: readonly AdaptationSignalInput[];
  allowedSignalKinds?: readonly string[];
  runtimeReady?: boolean;
  contract?: AdaptationSignalGate;
  governance?: AdaptationSignalGate;
};

export type AdaptationSignalCollectResult =
  | {
      ok: true;
      snapshot: AdaptationSignalSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AdaptationSignalError;
      events: readonly string[];
    };

export const adaptationSignalCollectorDescriptor = {
  surface: "runtime.adaptiveRuntime",
  capability: "adaptationSignalCollector",
  purpose: "collect narrow runtime adaptation signals without mutating runtime internals",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: AdaptationSignalCaller): AdaptationSignalCaller {
  const normalized: AdaptationSignalCaller = {
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
  code: AdaptationSignalErrorCode,
  message: string,
  boundary: AdaptationSignalBoundary,
): AdaptationSignalCollectResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.adaptiveRuntime.signalCollector.rejected"],
  };
}

function normalizeSignal(
  signal: AdaptationSignalInput,
  index: number,
  allowedSignalKinds: readonly string[],
  runtimeId: string,
): AdaptationSignalRecord | AdaptationSignalCollectResult {
  const kind = signal.kind?.trim();
  if (!hasText(kind)) {
    return failure("MISSING_SIGNAL_KIND", "adaptation signal collector requires every signal to declare a kind", "input");
  }

  const source = signal.source?.trim();
  if (!hasText(source)) {
    return failure("MISSING_SIGNAL_SOURCE", "adaptation signal collector requires every signal to declare a source", "input");
  }

  if (allowedSignalKinds.length > 0 && !allowedSignalKinds.includes(kind)) {
    return failure("SIGNAL_SCOPE_DENIED", `adaptation signal kind ${kind} is outside runtime governance`, "scope");
  }

  const weight = signal.weight ?? 1;
  if (!Number.isFinite(weight) || weight < 0) {
    return failure("INVALID_SIGNAL_WEIGHT", "adaptation signal weight must be a non-negative finite number", "input");
  }

  return {
    signalId: signal.signalId?.trim() || `${runtimeId}:signal:${index + 1}:${kind}`,
    kind,
    source,
    value: signal.value,
    weight,
    tags: cleanList(signal.tags),
    metadata: signal.metadata ?? {},
  };
}

export function collectAdaptationSignals(
  request?: AdaptationSignalCollectRequest,
): AdaptationSignalCollectResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "adaptation signal collector requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "adaptation signal collector requires an application, module, or runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "adaptation signals can only be collected through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "adaptation signal collection was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "adaptation signal collection was rejected by governance",
      "governance",
    );
  }

  if ((request.signals ?? []).length === 0) {
    return failure("MISSING_SIGNALS", "adaptation signal collector requires at least one runtime signal", "input");
  }

  const runtimeId = request.runtimeId.trim();
  const allowedSignalKinds = cleanList(request.allowedSignalKinds);
  const signals: AdaptationSignalRecord[] = [];
  for (const [index, signal] of (request.signals ?? []).entries()) {
    const normalized = normalizeSignal(signal, index, allowedSignalKinds, runtimeId);
    if ("ok" in normalized) {
      return normalized;
    }

    signals.push(normalized);
  }

  return {
    ok: true,
    snapshot: {
      runtimeId,
      collectorId: request.collectorId?.trim() || `${runtimeId}:adaptationSignalCollector`,
      caller: normalizeCaller(request.caller),
      route: "runtime.adaptiveRuntime.adaptationSignalCollector",
      signals,
      signalKinds: cleanList(signals.map((signal) => signal.kind)),
      signalSources: cleanList(signals.map((signal) => signal.source)),
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        contractSurface: "runtime.contractSurface",
        governanceRequired: true,
      },
    },
    events: ["runtime.adaptiveRuntime.signalCollector.collected"],
  };
}
