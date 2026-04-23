/*
 * 文件定位：Agent 运行态实现层 / 自适应运行面。
 * 核心目的：承载 adaptive Provider Fallback 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AdaptiveRuntimeCaller, AdaptiveRuntimeGate } from "./adaptiveCapabilitySelector.js";

export type AdaptiveProviderKind = "openai" | "anthropic" | "deepmind" | "customFormat" | (string & {});

export type AdaptiveProviderFallbackBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "provider"
  | "scope";

export type AdaptiveProviderFallbackErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_PROVIDERS"
  | "MISSING_PROVIDER_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "NO_FALLBACK_PROVIDER";

export type AdaptiveProviderFallbackError = {
  code: AdaptiveProviderFallbackErrorCode;
  message: string;
  boundary: AdaptiveProviderFallbackBoundary;
  publicSafe: true;
};

export type AdaptiveProviderHealthInput = {
  providerId?: string;
  provider?: AdaptiveProviderKind;
  ready?: boolean;
  healthScore?: number;
  priority?: number;
  latencyMs?: number;
  capabilities?: readonly string[];
  scopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type AdaptiveProviderFallbackRequest = {
  runtimeId?: string;
  caller?: AdaptiveRuntimeCaller;
  providers?: readonly AdaptiveProviderHealthInput[];
  currentProviderId?: string;
  requiredCapabilities?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: AdaptiveRuntimeGate;
  governance?: AdaptiveRuntimeGate;
};

export type AdaptiveProviderCandidate = {
  providerId: string;
  provider?: AdaptiveProviderKind;
  ready: true;
  healthScore: number;
  priority: number;
  latencyMs?: number;
  capabilities: readonly string[];
  scopes: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  rankScore: number;
};

export type AdaptiveProviderFallbackPlan = {
  planId: string;
  runtimeId: string;
  caller: AdaptiveRuntimeCaller;
  route: "runtime.adaptiveRuntime.adaptiveProviderFallback";
  currentProviderId?: string;
  selectedProvider: AdaptiveProviderCandidate;
  fallbackChain: readonly AdaptiveProviderCandidate[];
  rejectedProviderIds: readonly string[];
  requiredCapabilities: readonly string[];
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type AdaptiveProviderFallbackResult =
  | {
      ok: true;
      plan: AdaptiveProviderFallbackPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AdaptiveProviderFallbackError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
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
  code: AdaptiveProviderFallbackErrorCode,
  message: string,
  boundary: AdaptiveProviderFallbackBoundary,
): AdaptiveProviderFallbackResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.adaptiveRuntime.adaptiveProviderFallback.rejected"],
  };
}

function rankProvider(provider: AdaptiveProviderHealthInput): number {
  const priority = Number.isFinite(provider.priority) ? Number(provider.priority) : 0;
  const healthScore = Number.isFinite(provider.healthScore) ? Number(provider.healthScore) : 1;
  const latencyPenalty = Number.isFinite(provider.latencyMs) ? Math.max(Number(provider.latencyMs), 0) / 1000 : 0;
  return priority + healthScore - latencyPenalty;
}

function normalizeProvider(
  provider: AdaptiveProviderHealthInput,
): AdaptiveProviderCandidate | AdaptiveProviderFallbackResult {
  if (!hasText(provider.providerId)) {
    return failure("MISSING_PROVIDER_ID", "adaptive provider fallback requires every provider to have an id", "provider");
  }

  const normalized: AdaptiveProviderCandidate = {
    providerId: provider.providerId.trim(),
    ready: true,
    healthScore: Number.isFinite(provider.healthScore) ? Number(provider.healthScore) : 1,
    priority: Number.isFinite(provider.priority) ? Number(provider.priority) : 0,
    capabilities: cleanList(provider.capabilities),
    scopes: cleanList(provider.scopes),
    metadata: provider.metadata ?? {},
    rankScore: rankProvider(provider),
  };

  const providerKind = provider.provider?.trim();
  if (providerKind !== undefined && providerKind.length > 0) {
    normalized.provider = providerKind;
  }

  if (Number.isFinite(provider.latencyMs)) {
    normalized.latencyMs = Math.max(Number(provider.latencyMs), 0);
  }

  return normalized;
}

export function planAdaptiveProviderFallback(
  request?: AdaptiveProviderFallbackRequest,
): AdaptiveProviderFallbackResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "adaptive provider fallback requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "adaptive provider fallback requires a caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "adaptive provider fallback can only plan against a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "adaptive provider fallback was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "adaptive provider fallback was rejected by governance",
      "governance",
    );
  }

  if ((request.providers ?? []).length === 0) {
    return failure("MISSING_PROVIDERS", "adaptive provider fallback requires at least one provider candidate", "input");
  }

  const requiredCapabilities = cleanList(request.requiredCapabilities);
  const allowedScopes = cleanList(request.allowedScopes);
  const candidates: AdaptiveProviderCandidate[] = [];
  const rejectedProviderIds: string[] = [];

  for (const provider of request.providers ?? []) {
    const normalized = normalizeProvider(provider);
    if ("ok" in normalized) {
      return normalized;
    }

    const ready = provider.ready !== false;
    const capabilityMatches = requiredCapabilities.every((capability) => normalized.capabilities.includes(capability));
    const deniedScopes =
      allowedScopes.length === 0 ? [] : normalized.scopes.filter((scope) => !allowedScopes.includes(scope));

    if (deniedScopes.length > 0) {
      return failure(
        "SCOPE_DENIED",
        `adaptive provider fallback includes scopes outside governance: ${deniedScopes.join(", ")}`,
        "scope",
      );
    }

    if (ready && capabilityMatches) {
      candidates.push(normalized);
    } else {
      rejectedProviderIds.push(normalized.providerId);
    }
  }

  const sortedCandidates = [...candidates].sort(
    (left, right) => right.rankScore - left.rankScore || left.providerId.localeCompare(right.providerId),
  );
  const currentProviderId = request.currentProviderId?.trim();
  const fallbackChain = sortedCandidates.filter((provider) => provider.providerId !== currentProviderId);
  const selectedProvider = currentProviderId !== undefined && currentProviderId.length > 0 ? fallbackChain[0] : sortedCandidates[0];

  if (selectedProvider === undefined) {
    return failure(
      "NO_FALLBACK_PROVIDER",
      "adaptive provider fallback could not find a ready provider with the required capabilities",
      "provider",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const plan: AdaptiveProviderFallbackPlan = {
    planId: `${runtimeId}:adaptiveProviderFallback:${selectedProvider.providerId}`,
    runtimeId,
    caller: normalizeCaller(request.caller),
    route: "runtime.adaptiveRuntime.adaptiveProviderFallback",
    selectedProvider,
    fallbackChain,
    rejectedProviderIds,
    requiredCapabilities,
    contractChecked: true,
    governanceChecked: true,
    dryRun: true,
    unsafeSideEffects: false,
  };

  if (currentProviderId !== undefined && currentProviderId.length > 0) {
    plan.currentProviderId = currentProviderId;
  }

  return {
    ok: true,
    plan,
    events: ["runtime.adaptiveRuntime.adaptiveProviderFallback.planned"],
  };
}
