/*
 * 文件定位：Agent 运行态实现层 / 运行管理面。
 * 核心目的：承载 runtime Resource Governor 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  cleanRuntimeManagementList,
  hasRuntimeManagementText,
  type RuntimeManagementBoundary,
  type RuntimeManagementCaller,
  type RuntimeManagementError,
  type RuntimeManagementGate,
} from "./runtimeManagementPlane.js";

export type RuntimeResourceKind =
  | "cpu"
  | "memory"
  | "token"
  | "concurrency"
  | "tool-call"
  | "network"
  | "storage"
  | (string & {});

export type RuntimeResourceDemand = {
  resource?: RuntimeResourceKind;
  amount?: number;
  unit?: string;
  reason?: string;
  requestedScopes?: readonly string[];
};

export type RuntimeResourceBudget = {
  resource?: RuntimeResourceKind;
  limit?: number;
  used?: number;
  unit?: string;
  window?: string;
  hard?: boolean;
};

export type RuntimeResourceDecision = {
  resource: RuntimeResourceKind;
  requestedAmount: number;
  grantedAmount: number;
  remainingAfterGrant?: number;
  unit?: string;
  window?: string;
  status: "granted" | "capped";
  hardLimit: boolean;
  reason?: string;
};

export type RuntimeResourceGovernorSnapshot = {
  runtimeId: string;
  caller: RuntimeManagementCaller;
  route: "runtime.managementPlane.resourceGovernor";
  phase: "evaluated";
  decisions: readonly RuntimeResourceDecision[];
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  governanceChecked: true;
  contractChecked: true;
  auditRequired: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type RuntimeResourceGovernorErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_RESOURCE_DEMANDS"
  | "MISSING_RESOURCE_KIND"
  | "INVALID_RESOURCE_AMOUNT"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "RESOURCE_LIMIT_EXCEEDED";

export type RuntimeResourceGovernorError = Omit<RuntimeManagementError, "code"> & {
  code: RuntimeResourceGovernorErrorCode;
};

export type RuntimeResourceGovernorRequest = {
  runtimeId?: string;
  caller?: RuntimeManagementCaller;
  demands?: readonly RuntimeResourceDemand[];
  budgets?: readonly RuntimeResourceBudget[];
  runtimeReady?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: RuntimeManagementGate;
  governance?: RuntimeManagementGate;
};

export type RuntimeResourceGovernorResult =
  | {
      ok: true;
      governor: RuntimeResourceGovernorSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeResourceGovernorError;
      events: readonly string[];
    };

function rejectRuntimeResourceGovernor(
  code: RuntimeResourceGovernorErrorCode,
  message: string,
  boundary: RuntimeManagementBoundary,
): RuntimeResourceGovernorResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      internalDetailExposed: false,
    },
    events: ["runtime.managementPlane.resourceGovernor.rejected"],
  };
}

function normalizeCaller(caller: RuntimeManagementCaller): RuntimeManagementCaller {
  const normalized: RuntimeManagementCaller = {
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

function budgetByResource(budgets: readonly RuntimeResourceBudget[] | undefined): Map<RuntimeResourceKind, RuntimeResourceBudget> {
  const map = new Map<RuntimeResourceKind, RuntimeResourceBudget>();
  for (const budget of budgets ?? []) {
    const resource = budget.resource?.trim();
    if (hasRuntimeManagementText(resource)) {
      map.set(resource, budget);
    }
  }

  return map;
}

function evaluateDemand(
  demand: RuntimeResourceDemand,
  budgets: ReadonlyMap<RuntimeResourceKind, RuntimeResourceBudget>,
): RuntimeResourceDecision | RuntimeResourceGovernorResult {
  const resource = demand.resource?.trim();

  if (!hasRuntimeManagementText(resource)) {
    return rejectRuntimeResourceGovernor(
      "MISSING_RESOURCE_KIND",
      "runtime resource governor requires every demand to include a resource kind",
      "input",
    );
  }

  if (typeof demand.amount !== "number" || !Number.isFinite(demand.amount) || demand.amount <= 0) {
    return rejectRuntimeResourceGovernor(
      "INVALID_RESOURCE_AMOUNT",
      `runtime resource demand ${resource} requires a positive finite amount`,
      "input",
    );
  }

  const budget = budgets.get(resource);
  const used = budget?.used ?? 0;
  const limit = budget?.limit;
  const remaining = limit === undefined ? undefined : Math.max(limit - used, 0);
  const hardLimit = budget?.hard ?? true;

  if (remaining !== undefined && demand.amount > remaining && hardLimit) {
    return rejectRuntimeResourceGovernor(
      "RESOURCE_LIMIT_EXCEEDED",
      `runtime resource demand ${resource} exceeds its hard budget`,
      "governance",
    );
  }

  const grantedAmount = remaining === undefined ? demand.amount : Math.min(demand.amount, remaining);

  return {
    resource,
    requestedAmount: demand.amount,
    grantedAmount,
    remainingAfterGrant: remaining === undefined ? undefined : Math.max(remaining - grantedAmount, 0),
    unit: demand.unit?.trim() ?? budget?.unit?.trim(),
    window: budget?.window?.trim(),
    status: grantedAmount === demand.amount ? "granted" : "capped",
    hardLimit,
    reason: demand.reason?.trim(),
  };
}

export function governRuntimeResources(
  request?: RuntimeResourceGovernorRequest,
): RuntimeResourceGovernorResult {
  if (request === undefined || !hasRuntimeManagementText(request.runtimeId)) {
    return rejectRuntimeResourceGovernor("MISSING_RUNTIME_ID", "runtime resource governor requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasRuntimeManagementText(request.caller.id)) {
    return rejectRuntimeResourceGovernor(
      "MISSING_CALLER",
      "runtime resource governor requires an application, module, operator, or runtime caller",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeResourceGovernor(
      "RUNTIME_NOT_READY",
      "runtime resource governor can only evaluate resources for a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeResourceGovernor(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime resource governor was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeResourceGovernor(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime resource governor was rejected by governance",
      "governance",
    );
  }

  if ((request.demands ?? []).length === 0) {
    return rejectRuntimeResourceGovernor(
      "MISSING_RESOURCE_DEMANDS",
      "runtime resource governor requires at least one resource demand",
      "input",
    );
  }

  const requestedScopes = cleanRuntimeManagementList([
    ...(request.requestedScopes ?? []),
    ...(request.demands ?? []).flatMap((demand) => demand.requestedScopes ?? []),
  ]);
  const allowedScopes = cleanRuntimeManagementList(request.allowedScopes);
  const grantedScopes =
    allowedScopes.length === 0
      ? requestedScopes
      : requestedScopes.filter((scope) => allowedScopes.includes(scope));
  const deniedScopes =
    allowedScopes.length === 0
      ? []
      : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return rejectRuntimeResourceGovernor(
      "SCOPE_DENIED",
      `runtime resource governor includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const budgets = budgetByResource(request.budgets);
  const decisions: RuntimeResourceDecision[] = [];
  for (const demand of request.demands ?? []) {
    const decision = evaluateDemand(demand, budgets);
    if ("ok" in decision) {
      return decision;
    }

    decisions.push(decision);
  }

  return {
    ok: true,
    governor: {
      runtimeId: request.runtimeId.trim(),
      caller: normalizeCaller(request.caller),
      route: "runtime.managementPlane.resourceGovernor",
      phase: "evaluated",
      decisions,
      requestedScopes,
      grantedScopes,
      governanceChecked: true,
      contractChecked: true,
      auditRequired: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.managementPlane.resourceGovernor.evaluated"],
  };
}
