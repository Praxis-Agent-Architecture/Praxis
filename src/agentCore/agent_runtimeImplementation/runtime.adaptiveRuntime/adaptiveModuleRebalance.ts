/*
 * 文件定位：Agent 运行态实现层 / 自适应运行面。
 * 核心目的：承载 adaptive Module Rebalance 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AdaptiveRuntimeCaller, AdaptiveRuntimeGate } from "./adaptiveCapabilitySelector.js";

export type AdaptiveModuleKind = "CMP" | "MP" | "TAP" | "multiagent" | "custom" | (string & {});

export type AdaptiveModuleRebalanceBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "module"
  | "scope";

export type AdaptiveModuleRebalanceErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_MODULES"
  | "MISSING_MODULE_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "NO_REBALANCE_TARGETS";

export type AdaptiveModuleRebalanceError = {
  code: AdaptiveModuleRebalanceErrorCode;
  message: string;
  boundary: AdaptiveModuleRebalanceBoundary;
  publicSafe: true;
};

export type AdaptiveModuleLoadInput = {
  moduleId?: string;
  kind?: AdaptiveModuleKind;
  ready?: boolean;
  currentWeight?: number;
  targetWeight?: number;
  loadRatio?: number;
  errorRate?: number;
  scopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type AdaptiveModuleRebalanceStrategy = "stabilize" | "shed-load" | "favor-ready" | (string & {});

export type AdaptiveModuleRebalanceRequest = {
  runtimeId?: string;
  caller?: AdaptiveRuntimeCaller;
  modules?: readonly AdaptiveModuleLoadInput[];
  strategy?: AdaptiveModuleRebalanceStrategy;
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: AdaptiveRuntimeGate;
  governance?: AdaptiveRuntimeGate;
};

export type AdaptiveModuleSnapshot = {
  moduleId: string;
  kind?: AdaptiveModuleKind;
  ready: boolean;
  currentWeight: number;
  targetWeight: number;
  loadRatio: number;
  errorRate: number;
  scopes: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type AdaptiveModuleAdjustment = {
  moduleId: string;
  fromWeight: number;
  toWeight: number;
  delta: number;
  reason: "overloaded" | "underused" | "unready" | "stable";
};

export type AdaptiveModuleRebalancePlan = {
  planId: string;
  runtimeId: string;
  caller: AdaptiveRuntimeCaller;
  route: "runtime.adaptiveRuntime.adaptiveModuleRebalance";
  strategy: AdaptiveModuleRebalanceStrategy;
  modules: readonly AdaptiveModuleSnapshot[];
  adjustments: readonly AdaptiveModuleAdjustment[];
  activeModuleIds: readonly string[];
  isolatedModuleIds: readonly string[];
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type AdaptiveModuleRebalanceResult =
  | {
      ok: true;
      plan: AdaptiveModuleRebalancePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AdaptiveModuleRebalanceError;
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
  code: AdaptiveModuleRebalanceErrorCode,
  message: string,
  boundary: AdaptiveModuleRebalanceBoundary,
): AdaptiveModuleRebalanceResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.adaptiveRuntime.adaptiveModuleRebalance.rejected"],
  };
}

function normalizeModule(module: AdaptiveModuleLoadInput): AdaptiveModuleSnapshot | AdaptiveModuleRebalanceResult {
  if (!hasText(module.moduleId)) {
    return failure("MISSING_MODULE_ID", "adaptive module rebalance requires every module to have an id", "module");
  }

  const kind = module.kind?.trim();
  const currentWeight = clamp(Number.isFinite(module.currentWeight) ? Number(module.currentWeight) : 1, 0, 1);
  const targetWeight = clamp(Number.isFinite(module.targetWeight) ? Number(module.targetWeight) : currentWeight, 0, 1);
  const snapshot: AdaptiveModuleSnapshot = {
    moduleId: module.moduleId.trim(),
    ready: module.ready !== false,
    currentWeight,
    targetWeight,
    loadRatio: clamp(Number.isFinite(module.loadRatio) ? Number(module.loadRatio) : 0, 0, 1),
    errorRate: clamp(Number.isFinite(module.errorRate) ? Number(module.errorRate) : 0, 0, 1),
    scopes: cleanList(module.scopes),
    metadata: module.metadata ?? {},
  };

  if (kind !== undefined && kind.length > 0) {
    snapshot.kind = kind;
  }

  return snapshot;
}

function planAdjustment(module: AdaptiveModuleSnapshot, strategy: AdaptiveModuleRebalanceStrategy): AdaptiveModuleAdjustment {
  if (!module.ready) {
    return {
      moduleId: module.moduleId,
      fromWeight: module.currentWeight,
      toWeight: 0,
      delta: -module.currentWeight,
      reason: "unready",
    };
  }

  const pressure = module.loadRatio + module.errorRate;
  const shedAmount = strategy === "shed-load" ? 0.3 : 0.2;
  const boostAmount = strategy === "favor-ready" ? 0.2 : 0.1;
  let toWeight = module.targetWeight;
  let reason: AdaptiveModuleAdjustment["reason"] = "stable";

  if (pressure >= 1) {
    toWeight = clamp(module.currentWeight - shedAmount, 0, 1);
    reason = "overloaded";
  } else if (pressure <= 0.35) {
    toWeight = clamp(module.currentWeight + boostAmount, 0, 1);
    reason = "underused";
  }

  const delta = Number((toWeight - module.currentWeight).toFixed(4));
  return {
    moduleId: module.moduleId,
    fromWeight: module.currentWeight,
    toWeight,
    delta,
    reason,
  };
}

export function planAdaptiveModuleRebalance(
  request?: AdaptiveModuleRebalanceRequest,
): AdaptiveModuleRebalanceResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "adaptive module rebalance requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "adaptive module rebalance requires a caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "adaptive module rebalance can only plan against a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "adaptive module rebalance was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "adaptive module rebalance was rejected by governance",
      "governance",
    );
  }

  if ((request.modules ?? []).length === 0) {
    return failure("MISSING_MODULES", "adaptive module rebalance requires at least one module snapshot", "input");
  }

  const modules: AdaptiveModuleSnapshot[] = [];
  for (const module of request.modules ?? []) {
    const normalized = normalizeModule(module);
    if ("ok" in normalized) {
      return normalized;
    }
    modules.push(normalized);
  }

  const allowedScopes = cleanList(request.allowedScopes);
  const requestedScopes = cleanList(modules.flatMap((module) => module.scopes));
  const deniedScopes = allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));
  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `adaptive module rebalance includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const strategy = request.strategy?.trim() || "stabilize";
  const adjustments = modules.map((module) => planAdjustment(module, strategy));
  const changed = adjustments.filter((adjustment) => adjustment.delta !== 0 || adjustment.reason === "unready");
  if (changed.length === 0) {
    return failure("NO_REBALANCE_TARGETS", "adaptive module rebalance found no module requiring adjustment", "module");
  }

  const runtimeId = request.runtimeId.trim();
  return {
    ok: true,
    plan: {
      planId: `${runtimeId}:adaptiveModuleRebalance`,
      runtimeId,
      caller: normalizeCaller(request.caller),
      route: "runtime.adaptiveRuntime.adaptiveModuleRebalance",
      strategy,
      modules,
      adjustments: changed,
      activeModuleIds: modules.filter((module) => module.ready).map((module) => module.moduleId),
      isolatedModuleIds: modules.filter((module) => !module.ready).map((module) => module.moduleId),
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.adaptiveRuntime.adaptiveModuleRebalance.planned"],
  };
}
