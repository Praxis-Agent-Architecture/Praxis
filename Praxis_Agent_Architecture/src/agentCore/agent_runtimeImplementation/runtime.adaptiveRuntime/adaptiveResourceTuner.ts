/*
 * 文件定位：Agent 运行态实现层 / 自适应运行面。
 * 核心目的：承载 adaptive Resource Tuner 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AdaptiveRuntimeCaller, AdaptiveRuntimeGate } from "./adaptiveCapabilitySelector.js";

export type AdaptiveResourceName = "concurrency" | "tokenBudget" | "memoryMb" | "timeoutMs" | (string & {});

export type AdaptiveResourceTunerBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "resource"
  | "scope";

export type AdaptiveResourceTunerErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_RESOURCES"
  | "MISSING_RESOURCE_NAME"
  | "INVALID_RESOURCE_RANGE"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type AdaptiveResourceTunerError = {
  code: AdaptiveResourceTunerErrorCode;
  message: string;
  boundary: AdaptiveResourceTunerBoundary;
  publicSafe: true;
};

export type AdaptiveResourceSignalInput = {
  loadRatio?: number;
  errorRate?: number;
  latencyMs?: number;
  budgetPressure?: number;
};

export type AdaptiveResourceInput = {
  name?: AdaptiveResourceName;
  current?: number;
  min?: number;
  max?: number;
  step?: number;
  scopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type AdaptiveResourceTunerMode = "conservative" | "balanced" | "aggressive" | (string & {});

export type AdaptiveResourceTunerRequest = {
  runtimeId?: string;
  caller?: AdaptiveRuntimeCaller;
  resources?: readonly AdaptiveResourceInput[];
  signals?: AdaptiveResourceSignalInput;
  mode?: AdaptiveResourceTunerMode;
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: AdaptiveRuntimeGate;
  governance?: AdaptiveRuntimeGate;
};

export type AdaptiveResourceSnapshot = {
  name: AdaptiveResourceName;
  current: number;
  min: number;
  max: number;
  step: number;
  scopes: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type AdaptiveResourceRecommendation = {
  name: AdaptiveResourceName;
  current: number;
  recommended: number;
  delta: number;
  reason: "pressure-high" | "pressure-low" | "stable";
};

export type AdaptiveResourceTuningPlan = {
  planId: string;
  runtimeId: string;
  caller: AdaptiveRuntimeCaller;
  route: "runtime.adaptiveRuntime.adaptiveResourceTuner";
  mode: AdaptiveResourceTunerMode;
  signals: Required<AdaptiveResourceSignalInput>;
  resources: readonly AdaptiveResourceSnapshot[];
  recommendations: readonly AdaptiveResourceRecommendation[];
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type AdaptiveResourceTunerResult =
  | {
      ok: true;
      plan: AdaptiveResourceTuningPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AdaptiveResourceTunerError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeCaller(caller: AdaptiveRuntimeCaller): AdaptiveRuntimeCaller {
  const normalized: AdaptiveRuntimeCaller = {
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
  code: AdaptiveResourceTunerErrorCode,
  message: string,
  boundary: AdaptiveResourceTunerBoundary,
): AdaptiveResourceTunerResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.adaptiveRuntime.adaptiveResourceTuner.rejected"],
  };
}

function normalizeSignals(signals: AdaptiveResourceSignalInput | undefined): Required<AdaptiveResourceSignalInput> {
  return {
    loadRatio: clamp(Number.isFinite(signals?.loadRatio) ? Number(signals?.loadRatio) : 0, 0, 1),
    errorRate: clamp(Number.isFinite(signals?.errorRate) ? Number(signals?.errorRate) : 0, 0, 1),
    latencyMs: Math.max(Number.isFinite(signals?.latencyMs) ? Number(signals?.latencyMs) : 0, 0),
    budgetPressure: clamp(Number.isFinite(signals?.budgetPressure) ? Number(signals?.budgetPressure) : 0, 0, 1),
  };
}

function normalizeResource(resource: AdaptiveResourceInput): AdaptiveResourceSnapshot | AdaptiveResourceTunerResult {
  if (!hasText(resource.name)) {
    return failure("MISSING_RESOURCE_NAME", "adaptive resource tuner requires every resource to have a name", "resource");
  }

  const current = Number.isFinite(resource.current) ? Number(resource.current) : 0;
  const min = Number.isFinite(resource.min) ? Number(resource.min) : 0;
  const max = Number.isFinite(resource.max) ? Number(resource.max) : Math.max(current, min);
  const step = Number.isFinite(resource.step) && Number(resource.step) > 0 ? Number(resource.step) : 1;

  if (max < min) {
    return failure(
      "INVALID_RESOURCE_RANGE",
      `adaptive resource tuner received invalid range for ${resource.name.trim()}`,
      "resource",
    );
  }

  return {
    name: resource.name.trim(),
    current: clamp(current, min, max),
    min,
    max,
    step,
    scopes: cleanList(resource.scopes),
    metadata: resource.metadata ?? {},
  };
}

function tuneResource(
  resource: AdaptiveResourceSnapshot,
  signals: Required<AdaptiveResourceSignalInput>,
  mode: AdaptiveResourceTunerMode,
): AdaptiveResourceRecommendation {
  const pressure = signals.loadRatio + signals.errorRate + signals.budgetPressure;
  const multiplier = mode === "aggressive" ? 2 : mode === "conservative" ? 0.5 : 1;
  let recommended = resource.current;
  let reason: AdaptiveResourceRecommendation["reason"] = "stable";

  if (pressure >= 1.4) {
    recommended = resource.current - resource.step * multiplier;
    reason = "pressure-high";
  } else if (pressure <= 0.35 && signals.latencyMs < 1000) {
    recommended = resource.current + resource.step * multiplier;
    reason = "pressure-low";
  }

  recommended = clamp(Number(recommended.toFixed(4)), resource.min, resource.max);
  return {
    name: resource.name,
    current: resource.current,
    recommended,
    delta: Number((recommended - resource.current).toFixed(4)),
    reason,
  };
}

export function tuneAdaptiveResources(request?: AdaptiveResourceTunerRequest): AdaptiveResourceTunerResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "adaptive resource tuner requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "adaptive resource tuner requires a caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "adaptive resource tuner can only plan against a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "adaptive resource tuner was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "adaptive resource tuner was rejected by governance",
      "governance",
    );
  }

  if ((request.resources ?? []).length === 0) {
    return failure("MISSING_RESOURCES", "adaptive resource tuner requires at least one resource", "input");
  }

  const resources: AdaptiveResourceSnapshot[] = [];
  for (const resource of request.resources ?? []) {
    const normalized = normalizeResource(resource);
    if ("ok" in normalized) {
      return normalized;
    }
    resources.push(normalized);
  }

  const allowedScopes = cleanList(request.allowedScopes);
  const requestedScopes = cleanList(resources.flatMap((resource) => resource.scopes));
  const deniedScopes = allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));
  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `adaptive resource tuner includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const mode = request.mode?.trim() || "balanced";
  const signals = normalizeSignals(request.signals);

  return {
    ok: true,
    plan: {
      planId: `${runtimeId}:adaptiveResourceTuner`,
      runtimeId,
      caller: normalizeCaller(request.caller),
      route: "runtime.adaptiveRuntime.adaptiveResourceTuner",
      mode,
      signals,
      resources,
      recommendations: resources.map((resource) => tuneResource(resource, signals, mode)),
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.adaptiveRuntime.adaptiveResourceTuner.planned"],
  };
}
