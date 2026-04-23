/*
 * 文件定位：Agent 运行态实现层 / 接口适配运行态绑定面。
 * 核心目的：承载 interface Rule Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type InterfaceRuleRuntimeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "rule"
  | "scope";

export type InterfaceRuleRuntimeCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug"
  | "test";

export type InterfaceRuleRuntimeCaller = {
  kind: InterfaceRuleRuntimeCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type InterfaceRuleRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type InterfaceRuleRuntimePhase =
  | "definition"
  | "binding"
  | "invocation"
  | "inspection"
  | (string & {});

export type InterfaceRuleRuntimeRule = {
  ruleId?: string;
  interfaceId?: string;
  phase?: InterfaceRuleRuntimePhase;
  allowedOperations?: readonly string[];
  deniedOperations?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: InterfaceRuleRuntimeGate;
  governance?: InterfaceRuleRuntimeGate;
};

export type InterfaceRuleRuntimeRequest = {
  runtimeId?: string;
  caller?: InterfaceRuleRuntimeCaller;
  interfaceId?: string;
  operation?: string;
  phase?: InterfaceRuleRuntimePhase;
  rules?: readonly InterfaceRuleRuntimeRule[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: InterfaceRuleRuntimeGate;
  governance?: InterfaceRuleRuntimeGate;
  traceId?: string;
};

export type InterfaceRuleRuntimeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_INTERFACE_ID"
  | "EMPTY_RULES"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "RULE_INTERFACE_MISMATCH"
  | "OPERATION_DENIED";

export type InterfaceRuleRuntimeError = {
  code: InterfaceRuleRuntimeErrorCode;
  message: string;
  boundary: InterfaceRuleRuntimeBoundary;
  publicSafe: true;
  internalDetailExposed: false;
};

export type InterfaceRuleRuntimeDecision = {
  runtimeId: string;
  interfaceId: string;
  caller: InterfaceRuleRuntimeCaller;
  route: "runtime.interfaceAdapter.interfaceRuleRuntime";
  phase: InterfaceRuleRuntimePhase;
  operation?: string;
  appliedRuleIds: readonly string[];
  acceptedScopes: readonly string[];
  traceId?: string;
  dispatch: "dry-run";
  ruleRuntimeReady: true;
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type InterfaceRuleRuntimeResult =
  | {
      ok: true;
      decision: InterfaceRuleRuntimeDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InterfaceRuleRuntimeError;
      events: readonly string[];
    };

export const interfaceRuleRuntimeDescriptor = {
  route: "runtime.interfaceAdapter.interfaceRuleRuntime",
  purpose: "evaluate interface rules before runtime-mediated interface binding or invocation",
  dispatch: "dry-run",
  unsafeSideEffects: false,
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: InterfaceRuleRuntimeCaller): InterfaceRuleRuntimeCaller {
  const normalized: InterfaceRuleRuntimeCaller = {
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
  code: InterfaceRuleRuntimeErrorCode,
  message: string,
  boundary: InterfaceRuleRuntimeBoundary,
): InterfaceRuleRuntimeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true, internalDetailExposed: false },
    events: ["runtime.interfaceAdapter.interfaceRuleRuntime.rejected"],
  };
}

function resolveRequestedScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | InterfaceRuleRuntimeResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  if (allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `interfaceRuleRuntime scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function evaluateRule(
  rule: InterfaceRuleRuntimeRule,
  index: number,
  runtimeInterfaceId: string,
  operation: string | undefined,
  requestedScopes: readonly string[],
): string | InterfaceRuleRuntimeResult {
  const ruleId = rule.ruleId?.trim() || `rule-${index + 1}`;
  const ruleInterfaceId = rule.interfaceId?.trim();

  if (ruleInterfaceId !== undefined && ruleInterfaceId.length > 0 && ruleInterfaceId !== runtimeInterfaceId) {
    return failure(
      "RULE_INTERFACE_MISMATCH",
      `interface rule ${ruleId} targets ${ruleInterfaceId}, not ${runtimeInterfaceId}`,
      "rule",
    );
  }

  if (rule.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      rule.contract.reason ?? `contract rejected interface rule ${ruleId}`,
      "contract",
    );
  }

  if (rule.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      rule.governance.reason ?? `governance rejected interface rule ${ruleId}`,
      "governance",
    );
  }

  const ruleAllowedScopes = cleanList(rule.allowedScopes);
  if (requestedScopes.length > 0 && ruleAllowedScopes.length > 0) {
    const deniedScope = requestedScopes.find((scope) => !ruleAllowedScopes.includes(scope));
    if (deniedScope !== undefined) {
      return failure("SCOPE_DENIED", `interface rule ${ruleId} denies scope ${deniedScope}`, "scope");
    }
  }

  if (operation !== undefined) {
    const deniedOperations = new Set(cleanList(rule.deniedOperations));
    if (deniedOperations.has(operation)) {
      return failure("OPERATION_DENIED", `interface rule ${ruleId} denies operation ${operation}`, "governance");
    }

    const allowedOperations = new Set(cleanList(rule.allowedOperations));
    if (allowedOperations.size > 0 && !allowedOperations.has(operation)) {
      return failure("OPERATION_DENIED", `interface rule ${ruleId} does not allow operation ${operation}`, "governance");
    }
  }

  return ruleId;
}

export function evaluateInterfaceRuleRuntime(
  request?: InterfaceRuleRuntimeRequest,
): InterfaceRuleRuntimeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "interfaceRuleRuntime requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "interfaceRuleRuntime requires a caller", "input");
  }

  if (!hasText(request.interfaceId)) {
    return failure("MISSING_INTERFACE_ID", "interfaceRuleRuntime requires an interfaceId", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "interfaceRuleRuntime can only evaluate rules against a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "interfaceRuleRuntime was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "interfaceRuleRuntime was rejected by governance",
      "governance",
    );
  }

  if ((request.rules ?? []).length === 0) {
    return failure("EMPTY_RULES", "interfaceRuleRuntime requires at least one runtime interface rule", "input");
  }

  const acceptedScopes = resolveRequestedScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const runtimeInterfaceId = request.interfaceId.trim();
  const operation = request.operation?.trim() || undefined;
  const appliedRuleIds: string[] = [];

  for (const [index, rule] of (request.rules ?? []).entries()) {
    const appliedRule = evaluateRule(rule, index, runtimeInterfaceId, operation, acceptedScopes);
    if (typeof appliedRule !== "string") {
      return appliedRule;
    }

    appliedRuleIds.push(appliedRule);
  }

  return {
    ok: true,
    decision: {
      runtimeId: request.runtimeId.trim(),
      interfaceId: runtimeInterfaceId,
      caller: normalizeCaller(request.caller),
      route: "runtime.interfaceAdapter.interfaceRuleRuntime",
      phase: request.phase?.trim() || "binding",
      operation,
      appliedRuleIds,
      acceptedScopes,
      traceId: request.traceId?.trim() || undefined,
      dispatch: "dry-run",
      ruleRuntimeReady: true,
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.interfaceAdapter.interfaceRuleRuntime.evaluated"],
  };
}
