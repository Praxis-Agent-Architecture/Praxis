/*
 * 文件定位：Agent 运行态实现层 / 自适应运行面。
 * 核心目的：承载 adaptation Decision Surface 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AdaptationDecisionBoundary = "input" | "contract" | "governance" | "runtime-state" | "policy" | "signal";

export type AdaptationDecisionCallerKind = "application" | "official-module" | "runtime-surface" | "inspection" | "test";

export type AdaptationDecisionCaller = {
  kind: AdaptationDecisionCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type AdaptationDecisionGate = {
  accepted: boolean;
  reason?: string;
};

export type AdaptationDecisionAction =
  | "observe"
  | "select-capability"
  | "tune-resource"
  | "provider-fallback"
  | "module-rebalance"
  | (string & {});

export type AdaptationDecisionPolicyRef = {
  policyId?: string;
  action?: AdaptationDecisionAction;
  priority?: number;
  enabled?: boolean;
};

export type AdaptationDecisionSignalRef = {
  signalId?: string;
  kind?: string;
  weight?: number;
};

export type AdaptationDecisionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_DECISION_ID"
  | "MISSING_POLICIES"
  | "MISSING_POLICY_ID"
  | "MISSING_POLICY_ACTION"
  | "NO_ENABLED_POLICY"
  | "MISSING_SIGNALS"
  | "MISSING_SIGNAL_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AdaptationDecisionError = {
  code: AdaptationDecisionErrorCode;
  message: string;
  boundary: AdaptationDecisionBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type AdaptationDecisionRecord = {
  decisionId: string;
  runtimeId: string;
  caller: AdaptationDecisionCaller;
  route: "runtime.adaptiveRuntime.adaptationDecisionSurface";
  selectedPolicyId: string;
  action: AdaptationDecisionAction;
  consideredPolicyIds: readonly string[];
  signalIds: readonly string[];
  confidence: number;
  mode: "dry-run-decision";
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type AdaptationDecisionRequest = {
  runtimeId?: string;
  decisionId?: string;
  caller?: AdaptationDecisionCaller;
  policies?: readonly AdaptationDecisionPolicyRef[];
  signals?: readonly AdaptationDecisionSignalRef[];
  runtimeReady?: boolean;
  contract?: AdaptationDecisionGate;
  governance?: AdaptationDecisionGate;
};

export type AdaptationDecisionResult =
  | {
      ok: true;
      decision: AdaptationDecisionRecord;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AdaptationDecisionError;
      events: readonly string[];
    };

export const adaptationDecisionSurfaceDescriptor = {
  surface: "runtime.adaptiveRuntime",
  capability: "adaptationDecisionSurface",
  purpose: "choose a dry-run adaptation decision from registered policies and collected signals",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: AdaptationDecisionCaller): AdaptationDecisionCaller {
  const normalized: AdaptationDecisionCaller = {
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
  code: AdaptationDecisionErrorCode,
  message: string,
  boundary: AdaptationDecisionBoundary,
): AdaptationDecisionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.adaptiveRuntime.decisionSurface.rejected"],
  };
}

function firstValidSignalId(signals: readonly AdaptationDecisionSignalRef[]): readonly string[] | AdaptationDecisionResult {
  const signalIds = cleanList(signals.map((signal) => signal.signalId ?? ""));
  if (signalIds.length === 0) {
    return failure("MISSING_SIGNAL_ID", "adaptation decision surface requires at least one signal id", "signal");
  }

  return signalIds;
}

function choosePolicy(
  policies: readonly AdaptationDecisionPolicyRef[],
): AdaptationDecisionPolicyRef | AdaptationDecisionResult {
  for (const policy of policies) {
    if (!hasText(policy.policyId)) {
      return failure("MISSING_POLICY_ID", "adaptation decision surface requires every policy ref to include policyId", "policy");
    }

    if (!hasText(policy.action)) {
      return failure(
        "MISSING_POLICY_ACTION",
        "adaptation decision surface requires every policy ref to include an action",
        "policy",
      );
    }
  }

  const enabledPolicies = policies.filter((policy) => policy.enabled !== false);
  if (enabledPolicies.length === 0) {
    return failure("NO_ENABLED_POLICY", "adaptation decision surface needs at least one enabled policy", "policy");
  }

  return [...enabledPolicies].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0];
}

export function decideAdaptationSurface(request?: AdaptationDecisionRequest): AdaptationDecisionResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "adaptation decision surface requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "adaptation decision surface requires an application, module, or runtime caller", "input");
  }

  if (!hasText(request.decisionId)) {
    return failure("MISSING_DECISION_ID", "adaptation decision surface requires a decisionId for auditability", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "adaptation decisions can only be planned through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "adaptation decision was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "adaptation decision was rejected by governance",
      "governance",
    );
  }

  if ((request.policies ?? []).length === 0) {
    return failure("MISSING_POLICIES", "adaptation decision surface requires registered policy refs", "policy");
  }

  if ((request.signals ?? []).length === 0) {
    return failure("MISSING_SIGNALS", "adaptation decision surface requires collected signal refs", "signal");
  }

  const selectedPolicy = choosePolicy(request.policies ?? []);
  if ("ok" in selectedPolicy) {
    return selectedPolicy;
  }

  const signalIds = firstValidSignalId(request.signals ?? []);
  if ("ok" in signalIds) {
    return signalIds;
  }

  const runtimeId = request.runtimeId.trim();
  const decisionId = request.decisionId.trim();
  const maxSignalWeight = Math.max(1, ...(request.signals ?? []).map((signal) => signal.weight ?? 1));
  const selectedPriority = selectedPolicy.priority ?? 0;
  const confidence = Math.min(1, Number(((selectedPriority + maxSignalWeight) / (selectedPriority + maxSignalWeight + 1)).toFixed(4)));

  return {
    ok: true,
    decision: {
      decisionId,
      runtimeId,
      caller: normalizeCaller(request.caller),
      route: "runtime.adaptiveRuntime.adaptationDecisionSurface",
      selectedPolicyId: selectedPolicy.policyId?.trim() ?? "",
      action: selectedPolicy.action?.trim() ?? "observe",
      consideredPolicyIds: cleanList((request.policies ?? []).map((policy) => policy.policyId ?? "")),
      signalIds,
      confidence,
      mode: "dry-run-decision",
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.adaptiveRuntime.decisionSurface.decided"],
  };
}
