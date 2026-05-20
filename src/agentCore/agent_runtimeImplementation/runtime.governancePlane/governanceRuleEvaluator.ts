/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：执行治理规则判断，回答某个调用、模块动作或管理动作是否允许。
 * 能力要求1：需要返回通过、拒绝、需要审批、需要降级等明确结果。
 * 能力要求2：它不执行动作本身，只给 runtime 其他面提供治理裁决。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeAuthorityCallerKind, RuntimeAuthorityContext } from "./runtimeAuthorityResolver.js";

export type GovernanceDecisionStatus = "allow" | "deny" | "requires-approval" | "degrade";

export type GovernanceRuleBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type GovernanceRuleEvaluationErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_ACTION"
  | "MISSING_AUTHORITY"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED";

export type GovernanceRuleGate = {
  accepted: boolean;
  reason?: string;
};

export type GovernanceRuleMatch = {
  actions?: readonly string[];
  callerKinds?: readonly RuntimeAuthorityCallerKind[];
  requiredScopes?: readonly string[];
  runtimeIds?: readonly string[];
};

export type GovernanceRule = {
  id: string;
  decision: GovernanceDecisionStatus;
  reason?: string;
  priority?: number;
  match?: GovernanceRuleMatch;
  approvalToken?: string;
  degradationTarget?: string;
};

export type GovernanceRuleEvaluationRequest = {
  runtimeId?: string;
  action?: string;
  authority?: RuntimeAuthorityContext;
  requestedScopes?: readonly string[];
  rules?: readonly GovernanceRule[];
  runtimeReady?: boolean;
  contract?: GovernanceRuleGate;
};

export type GovernanceDecision = {
  status: GovernanceDecisionStatus;
  runtimeId: string;
  action: string;
  callerId: string;
  matchedRuleIds: readonly string[];
  requestedScopes: readonly string[];
  reason: string;
  approvalRequired: boolean;
  degradationTarget?: string;
  unsafeSideEffects: false;
};

export type GovernanceRuleEvaluationError = {
  code: GovernanceRuleEvaluationErrorCode;
  message: string;
  boundary: GovernanceRuleBoundary;
  publicSafe: true;
};

export type GovernanceRuleEvaluationResult =
  | {
      ok: true;
      decision: GovernanceDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: GovernanceRuleEvaluationError;
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
  code: GovernanceRuleEvaluationErrorCode,
  message: string,
  boundary: GovernanceRuleBoundary,
): GovernanceRuleEvaluationResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.governance.rule.rejected"],
  };
}

function ruleMatches(rule: GovernanceRule, request: GovernanceRuleEvaluationRequest, action: string): boolean {
  const match = rule.match;
  if (match === undefined) {
    return true;
  }

  if (match.actions !== undefined && !includesValue(match.actions, action)) {
    return false;
  }

  if (match.runtimeIds !== undefined && !includesValue(match.runtimeIds, request.runtimeId ?? "")) {
    return false;
  }

  if (match.callerKinds !== undefined && !match.callerKinds.includes(request.authority?.caller.kind ?? "application")) {
    return false;
  }

  const authorityScopes = request.authority?.scopes ?? [];
  return cleanList(match.requiredScopes).every((scope) => authorityScopes.includes(scope));
}

function decisionFromRule(
  request: GovernanceRuleEvaluationRequest,
  action: string,
  requestedScopes: readonly string[],
  rule?: GovernanceRule,
): GovernanceDecision {
  const status = rule?.decision ?? "allow";
  const runtimeId = (request.runtimeId ?? "").trim();
  const callerId = request.authority?.caller.id ?? "unknown";

  return {
    status,
    runtimeId,
    action,
    callerId,
    matchedRuleIds: rule === undefined ? [] : [rule.id],
    requestedScopes,
    reason: rule?.reason ?? "no matching governance rule denied the action",
    approvalRequired: status === "requires-approval",
    degradationTarget: status === "degrade" ? rule?.degradationTarget ?? "runtime.degraded" : undefined,
    unsafeSideEffects: false,
  };
}

export function evaluateGovernanceRule(
  request?: GovernanceRuleEvaluationRequest,
): GovernanceRuleEvaluationResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "governance rule evaluation requires a runtimeId", "input");
  }

  if (isBlank(request.action)) {
    return failure("MISSING_ACTION", "governance rule evaluation requires an action", "input");
  }

  if (request.authority === undefined) {
    return failure("MISSING_AUTHORITY", "governance rule evaluation requires an authority context", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "governance rules can only evaluate a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "governance rule evaluation was rejected by contract surface",
      "contract",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const action = (request.action ?? "").trim();
  const requestedScopes = cleanList(request.requestedScopes);
  const missingScopes = requestedScopes.filter((scope) => !request.authority?.scopes.includes(scope));

  if (missingScopes.length > 0) {
    return {
      ok: true,
      decision: {
        status: "deny",
        runtimeId,
        action,
        callerId: request.authority.caller.id,
        matchedRuleIds: [],
        requestedScopes,
        reason: `authority is missing required scope: ${missingScopes.join(", ")}`,
        approvalRequired: false,
        unsafeSideEffects: false,
      },
      events: ["runtime.governance.rule.denied"],
    };
  }

  const matchedRule = [...(request.rules ?? [])]
    .filter((rule) => !isBlank(rule.id) && ruleMatches(rule, request, action))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0];
  const decision = decisionFromRule(request, action, requestedScopes, matchedRule);

  return {
    ok: true,
    decision,
    events: [`runtime.governance.rule.${decision.status}`],
  };
}
