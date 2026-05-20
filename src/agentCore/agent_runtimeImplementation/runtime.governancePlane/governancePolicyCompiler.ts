/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：把声明式治理策略整理成运行时可快速判断的规则。
 * 能力要求1：需要处理策略合并、优先级、覆盖、默认值和禁用条件。
 * 能力要求2：避免每次调用都从原始配置临时解释，保证治理判断稳定可测。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type GovernancePolicySource = "dsl" | "application-config" | "official-module" | "management-plane";

export type GovernancePolicyEffect = "allow" | "deny" | "approval-required" | "degrade";

export type GovernancePolicyCompilerBoundary = "input" | "contract" | "governance" | "runtime-state";

export type GovernancePolicyCompilerErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_POLICY_ID"
  | "MISSING_POLICY_SOURCE"
  | "INVALID_POLICY_PRIORITY"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type GovernancePolicyGateCheck = {
  accepted: boolean;
  reason?: string;
};

export type GovernancePolicyDefaults = {
  effect?: GovernancePolicyEffect;
  subjects?: readonly string[];
  actions?: readonly string[];
  scopes?: readonly string[];
};

export type GovernancePolicyDeclaration = {
  policyId: string;
  source?: GovernancePolicySource;
  priority?: number;
  effect?: GovernancePolicyEffect;
  subjects?: readonly string[];
  actions?: readonly string[];
  scopes?: readonly string[];
  disabled?: boolean;
  overrides?: readonly string[];
  reason?: string;
};

export type CompiledGovernanceRule = {
  ruleId: string;
  policyId: string;
  source: GovernancePolicySource;
  priority: number;
  effect: GovernancePolicyEffect;
  subjects: readonly string[];
  actions: readonly string[];
  scopes: readonly string[];
  reason?: string;
  overrides: readonly string[];
};

export type CompiledGovernancePolicySet = {
  runtimeId: string;
  defaultEffect: GovernancePolicyEffect;
  rules: readonly CompiledGovernanceRule[];
  disabledPolicyIds: readonly string[];
  overriddenPolicyIds: readonly string[];
  readyForRuntimeEvaluation: true;
  unsafeSideEffects: false;
};

export type GovernancePolicyCompilerRequest = {
  runtimeId?: string;
  policies?: readonly GovernancePolicyDeclaration[];
  defaults?: GovernancePolicyDefaults;
  runtimeReady?: boolean;
  contract?: GovernancePolicyGateCheck;
  governance?: GovernancePolicyGateCheck;
};

export type GovernancePolicyCompilerError = {
  code: GovernancePolicyCompilerErrorCode;
  message: string;
  boundary: GovernancePolicyCompilerBoundary;
  safeForInspection: true;
};

export type GovernancePolicyCompilerResult =
  | {
      ok: true;
      policySet: CompiledGovernancePolicySet;
      events: readonly string[];
    }
  | {
      ok: false;
      error: GovernancePolicyCompilerError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: GovernancePolicyCompilerErrorCode,
  message: string,
  boundary: GovernancePolicyCompilerBoundary,
): GovernancePolicyCompilerResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForInspection: true,
    },
    events: ["runtime.governance.policyCompiler.rejected"],
  };
}

function compileRule(
  policy: GovernancePolicyDeclaration,
  defaults: GovernancePolicyDefaults,
): CompiledGovernanceRule {
  const policyId = policy.policyId.trim();
  return {
    ruleId: `${policyId}:compiled`,
    policyId,
    source: policy.source ?? "application-config",
    priority: policy.priority ?? 0,
    effect: policy.effect ?? defaults.effect ?? "deny",
    subjects: cleanList(policy.subjects).length > 0 ? cleanList(policy.subjects) : cleanList(defaults.subjects),
    actions: cleanList(policy.actions).length > 0 ? cleanList(policy.actions) : cleanList(defaults.actions),
    scopes: cleanList(policy.scopes).length > 0 ? cleanList(policy.scopes) : cleanList(defaults.scopes),
    reason: policy.reason?.trim() || undefined,
    overrides: cleanList(policy.overrides),
  };
}

export function compileGovernancePolicySet(
  request?: GovernancePolicyCompilerRequest,
): GovernancePolicyCompilerResult {
  if (request === undefined) {
    return failure("MISSING_RUNTIME_ID", "governance policy compiler requires a runtimeId", "input");
  }

  const runtimeId = request.runtimeId?.trim();
  if (!runtimeId) {
    return failure("MISSING_RUNTIME_ID", "governance policy compiler requires a runtimeId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "governance policy compiler requires a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected governance policy compilation",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected policy compilation",
      "governance",
    );
  }

  const policies = request.policies ?? [];
  for (const policy of policies) {
    if (isBlank(policy.policyId)) {
      return failure("MISSING_POLICY_ID", "each governance policy requires a policyId", "input");
    }

    if (policy.source === undefined) {
      return failure(
        "MISSING_POLICY_SOURCE",
        `governance policy ${policy.policyId.trim()} requires an explicit source`,
        "input",
      );
    }

    if (policy.priority !== undefined && !Number.isInteger(policy.priority)) {
      return failure(
        "INVALID_POLICY_PRIORITY",
        `governance policy ${policy.policyId.trim()} priority must be an integer`,
        "input",
      );
    }
  }

  const disabledPolicyIds = cleanList(policies.filter((policy) => policy.disabled === true).map((policy) => policy.policyId));
  const compiledRules = policies
    .filter((policy) => policy.disabled !== true)
    .map((policy) => compileRule(policy, request.defaults ?? {}));
  const overriddenPolicyIds = cleanList(compiledRules.flatMap((rule) => rule.overrides));
  const activeRules = compiledRules
    .filter((rule) => !overriddenPolicyIds.includes(rule.policyId))
    .sort((left, right) => right.priority - left.priority || left.policyId.localeCompare(right.policyId));

  return {
    ok: true,
    policySet: {
      runtimeId,
      defaultEffect: request.defaults?.effect ?? "deny",
      rules: activeRules,
      disabledPolicyIds,
      overriddenPolicyIds,
      readyForRuntimeEvaluation: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.governance.policyCompiler.compiled"],
  };
}
