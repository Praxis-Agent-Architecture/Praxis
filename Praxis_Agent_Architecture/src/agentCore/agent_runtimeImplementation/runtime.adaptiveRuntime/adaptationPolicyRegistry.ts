/*
 * 文件定位：Agent 运行态实现层 / 自适应运行面。
 * 核心目的：承载 adaptation Policy Registry 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AdaptationPolicyRegistryBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type AdaptationPolicyRegistryCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "test";

export type AdaptationPolicyRegistryCaller = {
  kind: AdaptationPolicyRegistryCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type AdaptationPolicyRegistryGate = {
  accepted: boolean;
  reason?: string;
};

export type AdaptationPolicyAction =
  | "observe"
  | "select-capability"
  | "tune-resource"
  | "provider-fallback"
  | "module-rebalance"
  | (string & {});

export type AdaptationPolicyInput = {
  policyId?: string;
  action?: AdaptationPolicyAction;
  priority?: number;
  signalKinds?: readonly string[];
  description?: string;
  enabled?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type AdaptationPolicyRegistryErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_POLICIES"
  | "MISSING_POLICY_ID"
  | "DUPLICATE_POLICY_ID"
  | "MISSING_POLICY_ACTION"
  | "INVALID_POLICY_PRIORITY"
  | "ACTION_SCOPE_DENIED"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AdaptationPolicyRegistryError = {
  code: AdaptationPolicyRegistryErrorCode;
  message: string;
  boundary: AdaptationPolicyRegistryBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type AdaptationPolicyRecord = {
  policyId: string;
  action: AdaptationPolicyAction;
  priority: number;
  signalKinds: readonly string[];
  description?: string;
  enabled: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type AdaptationPolicyRegistrySnapshot = {
  runtimeId: string;
  registryId: string;
  caller: AdaptationPolicyRegistryCaller;
  route: "runtime.adaptiveRuntime.adaptationPolicyRegistry";
  policies: readonly AdaptationPolicyRecord[];
  enabledPolicyIds: readonly string[];
  actions: readonly AdaptationPolicyAction[];
  audit: {
    dryRun: true;
    unsafeSideEffects: false;
    contractSurface: "runtime.contractSurface";
    governanceRequired: true;
  };
};

export type RegisterAdaptationPoliciesRequest = {
  runtimeId?: string;
  registryId?: string;
  caller?: AdaptationPolicyRegistryCaller;
  policies?: readonly AdaptationPolicyInput[];
  allowedActions?: readonly string[];
  runtimeReady?: boolean;
  contract?: AdaptationPolicyRegistryGate;
  governance?: AdaptationPolicyRegistryGate;
};

export type RegisterAdaptationPoliciesResult =
  | {
      ok: true;
      registry: AdaptationPolicyRegistrySnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AdaptationPolicyRegistryError;
      events: readonly string[];
    };

export const adaptationPolicyRegistryDescriptor = {
  surface: "runtime.adaptiveRuntime",
  capability: "adaptationPolicyRegistry",
  purpose: "register narrow adaptation policy descriptors without executing adaptive actions",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: AdaptationPolicyRegistryCaller): AdaptationPolicyRegistryCaller {
  const normalized: AdaptationPolicyRegistryCaller = {
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
  code: AdaptationPolicyRegistryErrorCode,
  message: string,
  boundary: AdaptationPolicyRegistryBoundary,
): RegisterAdaptationPoliciesResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.adaptiveRuntime.policyRegistry.rejected"],
  };
}

function normalizePolicy(
  policy: AdaptationPolicyInput,
  seenPolicyIds: Set<string>,
  allowedActions: readonly string[],
): AdaptationPolicyRecord | RegisterAdaptationPoliciesResult {
  const policyId = policy.policyId?.trim();
  if (!hasText(policyId)) {
    return failure("MISSING_POLICY_ID", "adaptation policy registry requires every policy to declare policyId", "input");
  }

  if (seenPolicyIds.has(policyId)) {
    return failure("DUPLICATE_POLICY_ID", `adaptation policy ${policyId} is registered more than once`, "input");
  }

  const action = policy.action?.trim();
  if (!hasText(action)) {
    return failure("MISSING_POLICY_ACTION", "adaptation policy registry requires every policy to declare an action", "input");
  }

  if (allowedActions.length > 0 && !allowedActions.includes(action)) {
    return failure("ACTION_SCOPE_DENIED", `adaptation action ${action} is outside runtime governance`, "scope");
  }

  const priority = policy.priority ?? 0;
  if (!Number.isInteger(priority) || priority < 0) {
    return failure("INVALID_POLICY_PRIORITY", "adaptation policy priority must be a non-negative integer", "input");
  }

  seenPolicyIds.add(policyId);

  const description = policy.description?.trim();
  const record: AdaptationPolicyRecord = {
    policyId,
    action,
    priority,
    signalKinds: cleanList(policy.signalKinds),
    enabled: policy.enabled !== false,
    metadata: policy.metadata ?? {},
  };

  if (description !== undefined && description.length > 0) {
    record.description = description;
  }

  return record;
}

export function registerAdaptationPolicies(
  request?: RegisterAdaptationPoliciesRequest,
): RegisterAdaptationPoliciesResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "adaptation policy registry requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "adaptation policy registry requires an application, module, or runtime caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "adaptation policies can only be registered through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "adaptation policy registry was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "adaptation policy registry was rejected by governance",
      "governance",
    );
  }

  if ((request.policies ?? []).length === 0) {
    return failure("MISSING_POLICIES", "adaptation policy registry requires at least one policy descriptor", "input");
  }

  const runtimeId = request.runtimeId.trim();
  const allowedActions = cleanList(request.allowedActions);
  const seenPolicyIds = new Set<string>();
  const policies: AdaptationPolicyRecord[] = [];
  for (const policy of request.policies ?? []) {
    const normalized = normalizePolicy(policy, seenPolicyIds, allowedActions);
    if ("ok" in normalized) {
      return normalized;
    }

    policies.push(normalized);
  }

  const orderedPolicies = [...policies].sort((left, right) => right.priority - left.priority);

  return {
    ok: true,
    registry: {
      runtimeId,
      registryId: request.registryId?.trim() || `${runtimeId}:adaptationPolicyRegistry`,
      caller: normalizeCaller(request.caller),
      route: "runtime.adaptiveRuntime.adaptationPolicyRegistry",
      policies: orderedPolicies,
      enabledPolicyIds: orderedPolicies.filter((policy) => policy.enabled).map((policy) => policy.policyId),
      actions: cleanList(orderedPolicies.map((policy) => policy.action)),
      audit: {
        dryRun: true,
        unsafeSideEffects: false,
        contractSurface: "runtime.contractSurface",
        governanceRequired: true,
      },
    },
    events: ["runtime.adaptiveRuntime.policyRegistry.registered"],
  };
}
