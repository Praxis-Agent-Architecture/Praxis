/*
 * 文件定位：Agent 运行态实现层 / 运行管理面。
 * 核心目的：承载 runtime Mutation Planner 这一能力位点。
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
  type RuntimeManagementSurface,
} from "./runtimeManagementPlane.js";

export type RuntimeMutationOperation =
  | "bind"
  | "unmount"
  | "configure"
  | "mode-switch"
  | "resource-tune"
  | "rollback-marker"
  | (string & {});

export type RuntimeMutationRisk = "low" | "medium" | "high" | "critical";

export type RuntimeMutationProposal = {
  mutationId?: string;
  targetSurface?: RuntimeManagementSurface;
  operation?: RuntimeMutationOperation;
  risk?: RuntimeMutationRisk;
  requestedScopes?: readonly string[];
  requiresRollback?: boolean;
  dryRunOnly?: boolean;
  reason?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeMutationPlanStep = {
  stepId: string;
  mutationId: string;
  targetSurface: RuntimeManagementSurface;
  operation: RuntimeMutationOperation;
  risk: RuntimeMutationRisk;
  guardrails: readonly string[];
  auditTags: readonly string[];
  rollbackRequired: boolean;
  dryRunOnly: true;
};

export type RuntimeMutationPlan = {
  runtimeId: string;
  caller: RuntimeManagementCaller;
  route: "runtime.managementPlane.mutationPlanner";
  phase: "planned";
  steps: readonly RuntimeMutationPlanStep[];
  mutationIds: readonly string[];
  targetSurfaces: readonly RuntimeManagementSurface[];
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  rollbackRequired: boolean;
  mockableEnvelope: true;
  governanceChecked: true;
  contractChecked: true;
  auditRequired: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type RuntimeMutationPlannerErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_MUTATIONS"
  | "MISSING_MUTATION_ID"
  | "MISSING_TARGET_SURFACE"
  | "MISSING_OPERATION"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "RISK_REVIEW_REQUIRED";

export type RuntimeMutationPlannerError = Omit<RuntimeManagementError, "code"> & {
  code: RuntimeMutationPlannerErrorCode;
};

export type RuntimeMutationPlannerResult =
  | {
      ok: true;
      plan: RuntimeMutationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeMutationPlannerError;
      events: readonly string[];
    };

export type RuntimeMutationPlannerRequest = {
  runtimeId?: string;
  caller?: RuntimeManagementCaller;
  mutations?: readonly RuntimeMutationProposal[];
  runtimeReady?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  reviewedRisks?: readonly RuntimeMutationRisk[];
  contract?: RuntimeManagementGate;
  governance?: RuntimeManagementGate;
};

function rejectRuntimeMutationPlan(
  code: RuntimeMutationPlannerErrorCode,
  message: string,
  boundary: RuntimeManagementBoundary,
): RuntimeMutationPlannerResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      publicSafe: true,
      internalDetailExposed: false,
    },
    events: ["runtime.managementPlane.mutationPlanner.rejected"],
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

function riskNeedsReview(risk: RuntimeMutationRisk): boolean {
  return risk === "high" || risk === "critical";
}

function createPlanStep(
  mutation: RuntimeMutationProposal,
  index: number,
): RuntimeMutationPlanStep | RuntimeMutationPlannerResult {
  const mutationId = mutation.mutationId?.trim();
  const targetSurface = mutation.targetSurface?.trim();
  const operation = mutation.operation?.trim();

  if (!hasRuntimeManagementText(mutationId)) {
    return rejectRuntimeMutationPlan(
      "MISSING_MUTATION_ID",
      "runtime mutation planner requires every mutation to include a mutationId",
      "input",
    );
  }

  if (!hasRuntimeManagementText(targetSurface)) {
    return rejectRuntimeMutationPlan(
      "MISSING_TARGET_SURFACE",
      `runtime mutation ${mutationId} requires a targetSurface`,
      "management-surface",
    );
  }

  if (!hasRuntimeManagementText(operation)) {
    return rejectRuntimeMutationPlan(
      "MISSING_OPERATION",
      `runtime mutation ${mutationId} requires an operation`,
      "input",
    );
  }

  const risk = mutation.risk ?? "low";
  const rollbackRequired = mutation.requiresRollback ?? risk !== "low";

  return {
    stepId: `mutation-step-${index + 1}`,
    mutationId,
    targetSurface,
    operation,
    risk,
    guardrails: [
      "contract-check-before-apply",
      "governance-check-before-apply",
      "dry-run-only-in-first-implementation",
    ],
    auditTags: cleanRuntimeManagementList([
      "runtime.managementPlane",
      targetSurface,
      operation,
      risk,
      ...(mutation.requestedScopes ?? []),
    ]),
    rollbackRequired,
    dryRunOnly: true,
  };
}

export function planRuntimeMutation(request?: RuntimeMutationPlannerRequest): RuntimeMutationPlannerResult {
  if (request === undefined || !hasRuntimeManagementText(request.runtimeId)) {
    return rejectRuntimeMutationPlan("MISSING_RUNTIME_ID", "runtime mutation planner requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasRuntimeManagementText(request.caller.id)) {
    return rejectRuntimeMutationPlan(
      "MISSING_CALLER",
      "runtime mutation planner requires an application, module, operator, or runtime caller",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeMutationPlan(
      "RUNTIME_NOT_READY",
      "runtime mutation planner can only plan changes for a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeMutationPlan(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime mutation planner was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeMutationPlan(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime mutation planner was rejected by governance",
      "governance",
    );
  }

  if ((request.mutations ?? []).length === 0) {
    return rejectRuntimeMutationPlan(
      "MISSING_MUTATIONS",
      "runtime mutation planner requires at least one proposed runtime mutation",
      "input",
    );
  }

  const requestedScopes = cleanRuntimeManagementList([
    ...(request.requestedScopes ?? []),
    ...(request.mutations ?? []).flatMap((mutation) => mutation.requestedScopes ?? []),
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
    return rejectRuntimeMutationPlan(
      "SCOPE_DENIED",
      `runtime mutation planner includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const steps: RuntimeMutationPlanStep[] = [];
  for (const [index, mutation] of (request.mutations ?? []).entries()) {
    const step = createPlanStep(mutation, index);
    if ("ok" in step) {
      return step;
    }

    steps.push(step);
  }

  const reviewedRisks = new Set(request.reviewedRisks ?? []);
  const unreviewedRisk = steps.find((step) => riskNeedsReview(step.risk) && !reviewedRisks.has(step.risk));

  if (unreviewedRisk !== undefined) {
    return rejectRuntimeMutationPlan(
      "RISK_REVIEW_REQUIRED",
      `runtime mutation ${unreviewedRisk.mutationId} requires explicit risk review`,
      "governance",
    );
  }

  return {
    ok: true,
    plan: {
      runtimeId: request.runtimeId.trim(),
      caller: normalizeCaller(request.caller),
      route: "runtime.managementPlane.mutationPlanner",
      phase: "planned",
      steps,
      mutationIds: steps.map((step) => step.mutationId),
      targetSurfaces: cleanRuntimeManagementList(steps.map((step) => step.targetSurface)),
      requestedScopes,
      grantedScopes,
      rollbackRequired: steps.some((step) => step.rollbackRequired),
      mockableEnvelope: true,
      governanceChecked: true,
      contractChecked: true,
      auditRequired: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.managementPlane.mutationPlanner.planned"],
  };
}
