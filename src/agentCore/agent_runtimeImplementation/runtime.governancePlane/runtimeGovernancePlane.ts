/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：作为 agentCore runtime 的治理总面，集中处理权限、策略、作用域、审计和模块治理。
 * 能力要求1：需要让上层 Agent 应用、官方模块、工具调用、模型调用都经过一致的治理判断。
 * 能力要求2：不能只做监控或日志，它是 Praxis 运行核心能被安全复用的关键边界。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const runtimeGovernancePlaneSurface = "runtime.governancePlane" as const;

export type RuntimeGovernanceDecisionStatus = "allow" | "deny" | "requires-approval" | "degrade";

export type RuntimeGovernanceBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type RuntimeGovernanceCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "tool"
  | "model"
  | "external-control";

export type RuntimeGovernanceActionKind = "agent" | "tool" | "model" | "module" | "interface" | "runtime";

export type RuntimeGovernanceErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_ACTION"
  | "MISSING_CALLER"
  | "MISSING_CALLER_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "MODULE_NOT_MOUNTED";

export type RuntimeGovernanceGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeGovernanceCaller = {
  kind: RuntimeGovernanceCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type RuntimeGovernancePolicy = {
  id: string;
  decision: RuntimeGovernanceDecisionStatus;
  actions?: readonly string[];
  callerKinds?: readonly RuntimeGovernanceCallerKind[];
  requiredScopes?: readonly string[];
  reason?: string;
  priority?: number;
  approvalChannel?: string;
  degradationTarget?: string;
};

export type RuntimeGovernancePlaneRequest = {
  runtimeId?: string;
  action?: string;
  actionKind?: RuntimeGovernanceActionKind;
  caller?: RuntimeGovernanceCaller;
  requestedScopes?: readonly string[];
  grantedScopes?: readonly string[];
  policies?: readonly RuntimeGovernancePolicy[];
  runtimeReady?: boolean;
  contract?: RuntimeGovernanceGate;
  governance?: RuntimeGovernanceGate;
  moduleMounted?: boolean;
  auditLabels?: readonly string[];
};

export type RuntimeGovernanceDecision = {
  status: RuntimeGovernanceDecisionStatus;
  runtimeId: string;
  action: string;
  actionKind: RuntimeGovernanceActionKind;
  caller: RuntimeGovernanceCaller;
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  missingScopes: readonly string[];
  matchedPolicyIds: readonly string[];
  reason: string;
  approvalRequired: boolean;
  approvalChannel?: string;
  degradationTarget?: string;
  auditTrail: readonly string[];
  governanceSurface: typeof runtimeGovernancePlaneSurface;
  unsafeSideEffects: false;
};

export type RuntimeGovernanceError = {
  code: RuntimeGovernanceErrorCode;
  message: string;
  boundary: RuntimeGovernanceBoundary;
  publicSafe: true;
};

export type RuntimeGovernancePlaneResult =
  | {
      ok: true;
      decision: RuntimeGovernanceDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeGovernanceError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function includesValue(values: readonly string[] | undefined, value: string): boolean {
  const candidates = cleanList(values);
  return candidates.includes("*") || candidates.includes(value);
}

function failure(
  code: RuntimeGovernanceErrorCode,
  message: string,
  boundary: RuntimeGovernanceBoundary,
): RuntimeGovernancePlaneResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.governance.plane.rejected"],
  };
}

function normalizeCaller(caller: RuntimeGovernanceCaller): RuntimeGovernanceCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
    sessionId: caller.sessionId?.trim() || undefined,
  };
}

function policyMatches(
  policy: RuntimeGovernancePolicy,
  request: RuntimeGovernancePlaneRequest,
  action: string,
  grantedScopes: readonly string[],
): boolean {
  if (isBlank(policy.id)) {
    return false;
  }

  if (policy.actions !== undefined && !includesValue(policy.actions, action)) {
    return false;
  }

  if (policy.callerKinds !== undefined && !policy.callerKinds.includes(request.caller?.kind ?? "application")) {
    return false;
  }

  return cleanList(policy.requiredScopes).every((scope) => grantedScopes.includes(scope));
}

function buildDecision(
  request: RuntimeGovernancePlaneRequest,
  action: string,
  requestedScopes: readonly string[],
  grantedScopes: readonly string[],
  matchedPolicy: RuntimeGovernancePolicy | undefined,
): RuntimeGovernanceDecision {
  const missingScopes = requestedScopes.filter((scope) => !grantedScopes.includes(scope));
  const status: RuntimeGovernanceDecisionStatus =
    missingScopes.length > 0 ? "deny" : matchedPolicy?.decision ?? "allow";
  const reason =
    missingScopes.length > 0
      ? `caller is missing required governance scope: ${missingScopes.join(", ")}`
      : matchedPolicy?.reason ?? "runtime governance plane allowed the action";
  const actionKind = request.actionKind ?? "runtime";

  return {
    status,
    runtimeId: (request.runtimeId ?? "").trim(),
    action,
    actionKind,
    caller: normalizeCaller(request.caller as RuntimeGovernanceCaller),
    requestedScopes,
    grantedScopes,
    missingScopes,
    matchedPolicyIds: matchedPolicy === undefined ? [] : [matchedPolicy.id.trim()],
    reason,
    approvalRequired: status === "requires-approval",
    approvalChannel: status === "requires-approval" ? matchedPolicy?.approvalChannel ?? "tap.approval" : undefined,
    degradationTarget: status === "degrade" ? matchedPolicy?.degradationTarget ?? "runtime.degraded" : undefined,
    auditTrail: cleanList([
      "runtime.governance.plane.evaluated",
      `runtime:${(request.runtimeId ?? "").trim()}`,
      `action:${action}`,
      ...cleanList(request.auditLabels),
    ]),
    governanceSurface: runtimeGovernancePlaneSurface,
    unsafeSideEffects: false,
  };
}

export function evaluateRuntimeGovernancePlane(
  request?: RuntimeGovernancePlaneRequest,
): RuntimeGovernancePlaneResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime governance plane requires a runtimeId", "input");
  }

  if (isBlank(request.action)) {
    return failure("MISSING_ACTION", "runtime governance plane requires an action", "input");
  }

  if (request.caller === undefined) {
    return failure("MISSING_CALLER", "runtime governance plane requires a caller", "input");
  }

  if (isBlank(request.caller.id)) {
    return failure("MISSING_CALLER_ID", "runtime governance caller requires a stable id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime governance plane can only guard a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime governance plane was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance plane was rejected by an upstream governance gate",
      "governance",
    );
  }

  if (request.caller.kind === "official-module" && request.moduleMounted === false) {
    return failure("MODULE_NOT_MOUNTED", "official module must be mounted before governance can delegate to it", "governance");
  }

  const action = (request.action ?? "").trim();
  const requestedScopes = cleanList(request.requestedScopes);
  const grantedScopes = cleanList(request.grantedScopes);
  const matchedPolicy = [...(request.policies ?? [])]
    .filter((policy) => policyMatches(policy, request, action, grantedScopes))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0];
  const decision = buildDecision(request, action, requestedScopes, grantedScopes, matchedPolicy);

  return {
    ok: true,
    decision,
    events: [`runtime.governance.plane.${decision.status}`],
  };
}
