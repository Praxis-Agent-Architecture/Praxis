/*
 * 文件定位：Agent 接口适配层 / 自定义接口层。
 * 核心目的：承载 custom Interface Rule Constrainer 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：定义接口接入方式，不实现 CMP/MP/TAP/multiagent 的内部策略。
 * 对接：需要被 runtime.interfaceAdapter 拉起，并服务官方模块和自定义接口进入 agentCore。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  hasCustomInterfaceScopeAccess,
  type CustomInterfaceError,
  type CustomInterfaceGate,
} from "./customInterfaceDefiner.js";

export type CustomInterfaceRuleErrorCode =
  | CustomInterfaceError["code"]
  | "MISSING_RULE"
  | "OPERATION_DENIED";

export type CustomInterfaceRuleError = Omit<CustomInterfaceError, "code"> & {
  code: CustomInterfaceRuleErrorCode;
};

export type CustomInterfaceConstraintRule = {
  ruleId?: string;
  allowedOperations?: readonly string[];
  deniedOperations?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: CustomInterfaceGate;
  governance?: CustomInterfaceGate;
};

export type CustomInterfaceRuleConstraintRequest = {
  interfaceId?: string;
  operation?: string;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  rules?: readonly CustomInterfaceConstraintRule[];
  contract?: CustomInterfaceGate;
  governance?: CustomInterfaceGate;
};

export type CustomInterfaceRuleConstraintDecision = {
  interfaceId: string;
  operation?: string;
  allowed: true;
  appliedRuleIds: readonly string[];
  dispatch: "dry-run";
  runtimeGoverned: true;
};

export type CustomInterfaceRuleConstraintResult =
  | {
      ok: true;
      decision: CustomInterfaceRuleConstraintDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomInterfaceRuleError;
      events: readonly string[];
    };

function uniqueTrimmed(values: readonly string[] | undefined): readonly string[] {
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized.length > 0) {
      seen.add(normalized);
    }
  }
  return [...seen];
}

function ruleFailure(
  code: CustomInterfaceRuleErrorCode,
  message: string,
  boundary: CustomInterfaceRuleError["boundary"],
): CustomInterfaceRuleConstraintResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["custom.interface.rule.rejected"],
  };
}

export function constrainCustomInterfaceRules(
  request: CustomInterfaceRuleConstraintRequest = {},
): CustomInterfaceRuleConstraintResult {
  const interfaceId = request.interfaceId?.trim();
  if (interfaceId === undefined || interfaceId.length === 0) {
    return ruleFailure("MISSING_INTERFACE_ID", "custom interface rules require an interfaceId", "input");
  }

  if ((request.rules ?? []).length === 0) {
    return ruleFailure("MISSING_RULE", `custom interface ${interfaceId} requires at least one constraint rule`, "input");
  }

  if (request.contract?.accepted === false) {
    return ruleFailure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? `contract rejected custom interface rules ${interfaceId}`,
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return ruleFailure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? `governance rejected custom interface rules ${interfaceId}`,
      "governance",
    );
  }

  if (!hasCustomInterfaceScopeAccess(request.requestedScopes, request.allowedScopes)) {
    return ruleFailure("SCOPE_DENIED", `scope denied for custom interface rules ${interfaceId}`, "scope");
  }

  const operation = request.operation?.trim() || undefined;
  const appliedRuleIds: string[] = [];

  for (const [index, rule] of (request.rules ?? []).entries()) {
    const ruleId = rule.ruleId?.trim() || `rule-${index + 1}`;

    if (rule.contract?.accepted === false) {
      return ruleFailure(
        "CONTRACT_REJECTED",
        rule.contract.reason ?? `contract rejected custom interface rule ${ruleId}`,
        "contract",
      );
    }

    if (rule.governance?.accepted === false) {
      return ruleFailure(
        "GOVERNANCE_REJECTED",
        rule.governance.reason ?? `governance rejected custom interface rule ${ruleId}`,
        "governance",
      );
    }

    if (!hasCustomInterfaceScopeAccess(request.requestedScopes, rule.allowedScopes)) {
      return ruleFailure("SCOPE_DENIED", `rule ${ruleId} denies requested scopes for ${interfaceId}`, "scope");
    }

    const deniedOperations = new Set(uniqueTrimmed(rule.deniedOperations));
    if (operation !== undefined && deniedOperations.has(operation)) {
      return ruleFailure("OPERATION_DENIED", `rule ${ruleId} denies operation ${operation}`, "governance");
    }

    const allowedOperations = new Set(uniqueTrimmed(rule.allowedOperations));
    if (operation !== undefined && allowedOperations.size > 0 && !allowedOperations.has(operation)) {
      return ruleFailure("OPERATION_DENIED", `rule ${ruleId} does not allow operation ${operation}`, "governance");
    }

    appliedRuleIds.push(ruleId);
  }

  return {
    ok: true,
    decision: {
      interfaceId,
      operation,
      allowed: true,
      appliedRuleIds,
      dispatch: "dry-run",
      runtimeGoverned: true,
    },
    events: ["custom.interface.rule.constrained"],
  };
}
