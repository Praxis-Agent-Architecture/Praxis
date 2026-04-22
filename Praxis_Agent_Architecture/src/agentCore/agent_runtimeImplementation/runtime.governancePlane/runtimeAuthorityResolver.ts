/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：解析当前调用者是谁，以及它在 runtime 中具有什么权限。
 * 能力要求1：调用者可能是上层应用、官方模块、子 Agent、操作者或外部控制端。
 * 能力要求2：需要把身份、会话、模块来源和治理策略合并成可判断的权限上下文。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeAuthorityCallerKind =
  | "application"
  | "official-module"
  | "sub-agent"
  | "operator"
  | "external-control"
  | "runtime-surface";

export type RuntimeAuthorityBoundary = "input" | "contract" | "governance" | "runtime-state";

export type RuntimeAuthorityErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_CALLER_ID"
  | "UNKNOWN_CALLER_KIND"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeAuthorityGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeAuthorityCaller = {
  kind: RuntimeAuthorityCallerKind;
  id: string;
  moduleId?: string;
  sessionId?: string;
};

export type RuntimeAuthorityResolverRequest = {
  runtimeId?: string;
  caller?: RuntimeAuthorityCaller;
  sessionId?: string;
  moduleSource?: string;
  grantedScopes?: readonly string[];
  policyScopes?: readonly string[];
  deniedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeAuthorityGate;
  governance?: RuntimeAuthorityGate;
};

export type RuntimeAuthorityContext = {
  runtimeId: string;
  caller: RuntimeAuthorityCaller;
  sessionId?: string;
  moduleSource?: string;
  scopes: readonly string[];
  policyScopes: readonly string[];
  deniedScopes: readonly string[];
  readonly: true;
  unsafeSideEffects: false;
};

export type RuntimeAuthorityError = {
  code: RuntimeAuthorityErrorCode;
  message: string;
  boundary: RuntimeAuthorityBoundary;
  publicSafe: true;
};

export type RuntimeAuthorityResolverResult =
  | {
      ok: true;
      authority: RuntimeAuthorityContext;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeAuthorityError;
      events: readonly string[];
    };

const knownCallerKinds = new Set<RuntimeAuthorityCallerKind>([
  "application",
  "official-module",
  "sub-agent",
  "operator",
  "external-control",
  "runtime-surface",
]);

const defaultScopesByCallerKind: Record<RuntimeAuthorityCallerKind, readonly string[]> = {
  application: ["runtime.read", "runtime.invoke"],
  "official-module": ["runtime.read", "module.requestGovernance"],
  "sub-agent": ["runtime.read", "agent.delegate"],
  operator: ["runtime.read", "runtime.inspect"],
  "external-control": ["runtime.read"],
  "runtime-surface": ["runtime.read", "runtime.coordinate"],
};

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeAuthorityErrorCode,
  message: string,
  boundary: RuntimeAuthorityBoundary,
): RuntimeAuthorityResolverResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.authority.rejected"],
  };
}

export function resolveRuntimeAuthority(
  request?: RuntimeAuthorityResolverRequest,
): RuntimeAuthorityResolverResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime authority resolution requires a runtimeId", "input");
  }

  if (request.caller === undefined) {
    return failure("MISSING_CALLER", "runtime authority resolution requires a caller", "input");
  }

  if (!knownCallerKinds.has(request.caller.kind)) {
    return failure("UNKNOWN_CALLER_KIND", "runtime authority caller kind is not recognized", "input");
  }

  if (isBlank(request.caller.id)) {
    return failure("MISSING_CALLER_ID", "runtime authority caller requires a stable id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime authority can only be resolved against a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime authority was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime authority was rejected by governance",
      "governance",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const deniedScopes = cleanList(request.deniedScopes);
  const policyScopes = cleanList(request.policyScopes);
  const grantedScopes = cleanList(request.grantedScopes);
  const baseScopes = grantedScopes.length > 0 ? grantedScopes : defaultScopesByCallerKind[request.caller.kind];
  const scopes = cleanList([...baseScopes, ...policyScopes]).filter((scope) => !deniedScopes.includes(scope));

  return {
    ok: true,
    authority: {
      runtimeId,
      caller: {
        kind: request.caller.kind,
        id: request.caller.id.trim(),
        moduleId: request.caller.moduleId?.trim() || undefined,
        sessionId: request.caller.sessionId?.trim() || undefined,
      },
      sessionId: request.sessionId?.trim() || request.caller.sessionId?.trim() || undefined,
      moduleSource: request.moduleSource?.trim() || undefined,
      scopes,
      policyScopes,
      deniedScopes,
      readonly: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.authority.resolved"],
  };
}
