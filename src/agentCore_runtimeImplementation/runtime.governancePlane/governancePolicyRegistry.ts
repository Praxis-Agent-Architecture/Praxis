/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：登记 runtime 可执行的治理策略，例如谁能调用、能调什么、在哪种模式下能调。
 * 能力要求1：需要支持来自 DSL、应用配置、官方模块和运行时管理面的策略来源。
 * 能力要求2：后续实现要能被 rule evaluator、managementPlane、officialModuleSurface 共同查询。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { GovernancePolicyDeclaration, GovernancePolicySource } from "./governancePolicyCompiler.js";

export type GovernancePolicyRegistryBoundary = "input" | "contract" | "governance" | "runtime-state";

export type GovernancePolicyRegistryErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_POLICY"
  | "MISSING_POLICY_ID"
  | "MISSING_POLICY_SOURCE"
  | "DUPLICATE_POLICY"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type GovernancePolicyRegistryGateCheck = {
  accepted: boolean;
  reason?: string;
};

export type GovernancePolicyRegistryEntry = GovernancePolicyDeclaration & {
  policyId: string;
  source: GovernancePolicySource;
  registeredAt: string;
  revision: number;
  enabled: boolean;
};

export type GovernancePolicyRegistrySnapshot = {
  runtimeId: string;
  entries: readonly GovernancePolicyRegistryEntry[];
  sources: readonly GovernancePolicySource[];
  queryableByRuntime: true;
  unsafeSideEffects: false;
};

export type GovernancePolicyRegistryRequest = {
  runtimeId?: string;
  policies?: readonly GovernancePolicyDeclaration[];
  existingEntries?: readonly GovernancePolicyRegistryEntry[];
  replace?: boolean;
  registeredAt?: string;
  runtimeReady?: boolean;
  contract?: GovernancePolicyRegistryGateCheck;
  governance?: GovernancePolicyRegistryGateCheck;
};

export type GovernancePolicyRegistryError = {
  code: GovernancePolicyRegistryErrorCode;
  message: string;
  boundary: GovernancePolicyRegistryBoundary;
  safeForManagement: true;
};

export type GovernancePolicyRegistryResult =
  | {
      ok: true;
      registry: GovernancePolicyRegistrySnapshot;
      registeredPolicyIds: readonly string[];
      events: readonly string[];
    }
  | {
      ok: false;
      error: GovernancePolicyRegistryError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function failure(
  code: GovernancePolicyRegistryErrorCode,
  message: string,
  boundary: GovernancePolicyRegistryBoundary,
): GovernancePolicyRegistryResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForManagement: true,
    },
    events: ["runtime.governance.policyRegistry.rejected"],
  };
}

function normalizeEntry(
  policy: GovernancePolicyDeclaration,
  existingEntry: GovernancePolicyRegistryEntry | undefined,
  registeredAt: string,
): GovernancePolicyRegistryEntry {
  return {
    ...policy,
    policyId: policy.policyId.trim(),
    source: policy.source ?? "application-config",
    subjects: cleanList(policy.subjects),
    actions: cleanList(policy.actions),
    scopes: cleanList(policy.scopes),
    overrides: cleanList(policy.overrides),
    registeredAt,
    revision: existingEntry === undefined ? 1 : existingEntry.revision + 1,
    enabled: policy.disabled !== true,
  };
}

export function registerGovernancePolicies(
  request?: GovernancePolicyRegistryRequest,
): GovernancePolicyRegistryResult {
  if (request === undefined) {
    return failure("MISSING_RUNTIME_ID", "governance policy registry requires a runtimeId", "input");
  }

  const runtimeId = request.runtimeId?.trim();
  if (!runtimeId) {
    return failure("MISSING_RUNTIME_ID", "governance policy registry requires a runtimeId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "governance policy registry requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected governance policy registration",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected policy registration",
      "governance",
    );
  }

  const policies = request.policies ?? [];
  if (policies.length === 0) {
    return failure("MISSING_POLICY", "governance policy registry requires at least one policy", "input");
  }

  const seen = new Set<string>();
  for (const policy of policies) {
    if (isBlank(policy.policyId)) {
      return failure("MISSING_POLICY_ID", "each registered governance policy requires a policyId", "input");
    }

    if (policy.source === undefined) {
      return failure(
        "MISSING_POLICY_SOURCE",
        `governance policy ${policy.policyId.trim()} requires an explicit source`,
        "input",
      );
    }

    const policyId = policy.policyId.trim();
    if (seen.has(policyId)) {
      return failure("DUPLICATE_POLICY", `governance policy ${policyId} appears more than once`, "input");
    }
    seen.add(policyId);
  }

  const existingEntries = request.existingEntries ?? [];
  const registeredAt = request.registeredAt?.trim() || "dry-run";
  const registeredPolicyIds = policies.map((policy) => policy.policyId.trim());
  const retainedEntries = existingEntries.filter((entry) => !registeredPolicyIds.includes(entry.policyId));

  if (request.replace !== true) {
    const duplicate = existingEntries.find((entry) => registeredPolicyIds.includes(entry.policyId));
    if (duplicate !== undefined) {
      return failure(
        "DUPLICATE_POLICY",
        `governance policy ${duplicate.policyId} is already registered`,
        "input",
      );
    }
  }

  const newEntries = policies.map((policy) =>
    normalizeEntry(
      policy,
      existingEntries.find((entry) => entry.policyId === policy.policyId.trim()),
      registeredAt,
    ),
  );
  const entries = [...retainedEntries, ...newEntries].sort((left, right) =>
    left.policyId.localeCompare(right.policyId),
  );

  return {
    ok: true,
    registry: {
      runtimeId,
      entries,
      sources: cleanList(entries.map((entry) => entry.source)),
      queryableByRuntime: true,
      unsafeSideEffects: false,
    },
    registeredPolicyIds,
    events: ["runtime.governance.policyRegistry.registered"],
  };
}
