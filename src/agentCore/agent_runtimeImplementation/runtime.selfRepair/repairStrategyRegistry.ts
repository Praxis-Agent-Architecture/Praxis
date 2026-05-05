/*
 * 文件定位：Agent 运行态实现层 / 自修复面。
 * 核心目的：承载 repair Strategy Registry 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeFaultCategory } from "./faultClassifier.js";
import type { RuntimeRepairPlanRisk, RuntimeRepairPlanStepKind } from "./repairPlanBuilder.js";

export type RuntimeRepairStrategyRegistryBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "scope"
  | "registry";

export type RuntimeRepairStrategyRegistryErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_STRATEGIES"
  | "MISSING_STRATEGY_ID"
  | "MISSING_STRATEGY_KIND"
  | "DUPLICATE_STRATEGY_ID"
  | "STRATEGY_SCOPE_DENIED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeRepairStrategyRegistryGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeRepairStrategyDefinition = {
  strategyId?: string;
  kind?: RuntimeRepairPlanStepKind;
  summary?: string;
  supportedFaultCategories?: readonly RuntimeFaultCategory[];
  risk?: RuntimeRepairPlanRisk;
  requiresApproval?: boolean;
  ownerSurface?: "applicationSurface" | "officialModuleSurface" | "runtime" | "test" | (string & {});
  tags?: readonly string[];
};

export type RuntimeRepairStrategyQuery = {
  strategyId?: string;
  kind?: RuntimeRepairPlanStepKind;
  faultCategory?: RuntimeFaultCategory;
  tags?: readonly string[];
};

export type RuntimeRepairStrategy = {
  strategyId: string;
  kind: RuntimeRepairPlanStepKind;
  summary: string;
  supportedFaultCategories: readonly RuntimeFaultCategory[];
  risk: RuntimeRepairPlanRisk;
  requiresApproval: boolean;
  ownerSurface: string;
  tags: readonly string[];
  dryRunOnly: true;
  unsafeSideEffects: false;
};

export type RuntimeRepairStrategyRegistrySnapshot = {
  runtimeId: string;
  strategies: readonly RuntimeRepairStrategy[];
  matchedStrategies: readonly RuntimeRepairStrategy[];
  strategyCount: number;
  matchedCount: number;
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    registry: "runtime.selfRepair.repairStrategyRegistry";
    contractChecked: true;
    governanceChecked: true;
  };
};

export type RuntimeRepairStrategyRegistryError = {
  code: RuntimeRepairStrategyRegistryErrorCode;
  message: string;
  boundary: RuntimeRepairStrategyRegistryBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeRepairStrategyRegistryRequest = {
  runtimeId?: string;
  strategies?: readonly RuntimeRepairStrategyDefinition[];
  query?: RuntimeRepairStrategyQuery;
  allowedStrategyKinds?: readonly RuntimeRepairPlanStepKind[];
  runtimeReady?: boolean;
  contract?: RuntimeRepairStrategyRegistryGate;
  governance?: RuntimeRepairStrategyRegistryGate;
};

export type RuntimeRepairStrategyRegistryResult =
  | {
      ok: true;
      registry: RuntimeRepairStrategyRegistrySnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeRepairStrategyRegistryError;
      events: readonly string[];
    };

export const runtimeRepairStrategyRegistryDescriptor = {
  surface: "runtime.selfRepair",
  capability: "repairStrategyRegistry",
  purpose: "register and query dry-run self-repair strategies without executing repair actions",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))] as unknown as readonly T[];
}

function failure(
  code: RuntimeRepairStrategyRegistryErrorCode,
  message: string,
  boundary: RuntimeRepairStrategyRegistryBoundary,
): RuntimeRepairStrategyRegistryResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.selfRepair.repairStrategyRegistry.rejected"],
  };
}

function normalizeStrategy(definition: RuntimeRepairStrategyDefinition): RuntimeRepairStrategy | undefined {
  if (!hasText(definition.strategyId) || !hasText(definition.kind)) {
    return undefined;
  }

  const kind = definition.kind.trim() as RuntimeRepairPlanStepKind;

  return {
    strategyId: definition.strategyId.trim(),
    kind,
    summary: definition.summary?.trim() || `${kind} self-repair strategy`,
    supportedFaultCategories: cleanList(definition.supportedFaultCategories),
    risk: definition.risk ?? "low",
    requiresApproval: definition.requiresApproval ?? definition.risk === "high",
    ownerSurface: definition.ownerSurface?.trim() || "runtime",
    tags: cleanList(definition.tags),
    dryRunOnly: true,
    unsafeSideEffects: false,
  };
}

function matchesQuery(strategy: RuntimeRepairStrategy, query: RuntimeRepairStrategyQuery | undefined): boolean {
  if (query === undefined) {
    return true;
  }

  if (hasText(query.strategyId) && strategy.strategyId !== query.strategyId.trim()) {
    return false;
  }

  if (hasText(query.kind) && strategy.kind !== query.kind.trim()) {
    return false;
  }

  if (query.faultCategory !== undefined && !strategy.supportedFaultCategories.includes(query.faultCategory)) {
    return false;
  }

  const queryTags = cleanList(query.tags);
  if (queryTags.length > 0 && !queryTags.every((tag) => strategy.tags.includes(tag))) {
    return false;
  }

  return true;
}

export function createRepairStrategyRegistry(
  request?: RuntimeRepairStrategyRegistryRequest,
): RuntimeRepairStrategyRegistryResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "repair strategy registry requires a runtimeId", "input");
  }

  if (request.strategies === undefined || request.strategies.length === 0) {
    return failure("MISSING_STRATEGIES", "repair strategy registry requires at least one strategy", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "repair strategies can only be registered through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "repair strategy registry was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "repair strategy registry was rejected by governance",
      "governance",
    );
  }

  const allowedStrategyKinds = cleanList(request.allowedStrategyKinds);
  const strategies: RuntimeRepairStrategy[] = [];
  const seen = new Set<string>();

  for (const definition of request.strategies) {
    if (!hasText(definition.strategyId)) {
      return failure("MISSING_STRATEGY_ID", "each repair strategy requires a stable strategyId", "input");
    }

    if (!hasText(definition.kind)) {
      return failure("MISSING_STRATEGY_KIND", "each repair strategy requires a strategy kind", "input");
    }

    const strategy = normalizeStrategy(definition);
    if (strategy === undefined) {
      return failure("MISSING_STRATEGY_KIND", "repair strategy could not be normalized", "input");
    }

    if (seen.has(strategy.strategyId)) {
      return failure("DUPLICATE_STRATEGY_ID", `repair strategy ${strategy.strategyId} is already registered`, "registry");
    }

    if (allowedStrategyKinds.length > 0 && !allowedStrategyKinds.includes(strategy.kind)) {
      return failure("STRATEGY_SCOPE_DENIED", `repair strategy ${strategy.kind} is outside the allowed scope`, "scope");
    }

    seen.add(strategy.strategyId);
    strategies.push(strategy);
  }

  const matchedStrategies = strategies.filter((strategy) => matchesQuery(strategy, request.query));

  return {
    ok: true,
    registry: {
      runtimeId: request.runtimeId.trim(),
      strategies,
      matchedStrategies,
      strategyCount: strategies.length,
      matchedCount: matchedStrategies.length,
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        registry: "runtime.selfRepair.repairStrategyRegistry",
        contractChecked: true,
        governanceChecked: true,
      },
    },
    events: ["runtime.selfRepair.repairStrategyRegistry.ready"],
  };
}
