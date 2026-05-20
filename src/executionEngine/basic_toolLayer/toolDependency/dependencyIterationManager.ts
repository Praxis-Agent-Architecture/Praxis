/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 工具依赖管理层。
 * 核心目的：承载 dependency Iteration Manager 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  ToolDependencyInstallPlan,
  ToolDependencyInstallTarget,
} from "./dependencySourceRegistry.js";
import { planDependencyInstallation } from "./dependencySourceRegistry.js";
import type {
  ToolDependencyDeclaration,
  ToolDependencyManagerError,
  ToolDependencyManagerRequest,
  ToolDependencyReport,
  ToolDependencyResolution,
  ToolDependencyStatus,
} from "./dependencyManager.js";
import { manageToolDependencies } from "./dependencyManager.js";

export type ToolDependencyIterationBoundary = "input" | "contract" | "governance" | "scope";

export type ToolDependencyRefreshReason = "missing" | "stale" | "conflict" | "blocked" | "unknown" | "manual";

export type ToolDependencyRefreshAction =
  | "probe"
  | "install"
  | "refresh-version"
  | "resolve-conflict"
  | "request-scope"
  | "manual-review";

export type ToolDependencyIterationStrategy = {
  maxIterations?: number;
  refreshMissing?: boolean;
  refreshStale?: boolean;
  reviewConflicts?: boolean;
  includeOptional?: boolean;
  installTarget?: ToolDependencyInstallTarget;
  managedRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
};

export type ToolDependencyIterationContext = {
  runtimeId?: string;
  invocationId?: string;
  dryRun?: boolean;
  guard?: {
    accepted: boolean;
    reason?: string;
  };
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencyIterationRequest = {
  toolId?: string;
  currentIteration?: number;
  declarations?: readonly ToolDependencyDeclaration[];
  report?: ToolDependencyReport;
  strategy?: ToolDependencyIterationStrategy;
  context?: ToolDependencyIterationContext;
};

export type ToolDependencyIterationErrorCode =
  | "MISSING_TOOL_ID"
  | "TOOL_ID_MISMATCH"
  | "MISSING_DEPENDENCY_REPORT"
  | "INVALID_ITERATION"
  | "ITERATION_LIMIT_REACHED"
  | "REAL_REFRESH_NOT_ALLOWED"
  | "GOVERNANCE_REJECTED"
  | "DEPENDENCY_RESOLUTION_FAILED";

export type ToolDependencyIterationError = {
  code: ToolDependencyIterationErrorCode;
  message: string;
  boundary: ToolDependencyIterationBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
  cause?: Pick<ToolDependencyManagerError, "code" | "boundary" | "message">;
};

export type ToolDependencyRefreshStep = {
  dependencyId: string;
  action: ToolDependencyRefreshAction;
  reason: ToolDependencyRefreshReason;
  required: boolean;
  fromStatus: ToolDependencyStatus;
  requestedVersion?: string;
  observedVersion?: string;
  installPlan?: ToolDependencyInstallPlan;
  approvalRequired: boolean;
  notes: readonly string[];
};

export type ToolDependencyIterationPlan = {
  toolId: string;
  runtimeId?: string;
  invocationId?: string;
  currentIteration: number;
  nextIteration: number;
  maxIterations: number;
  status: "complete" | "needs-refresh" | "blocked";
  sourceReportStatus: ToolDependencyStatus;
  refreshSteps: readonly ToolDependencyRefreshStep[];
  dryRun: true;
  unsafeSideEffects: false;
  audit: {
    event: "agentCore.basicToolLayer.toolDependency.iteration.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ToolDependencyIterationResult =
  | {
      ok: true;
      plan: ToolDependencyIterationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ToolDependencyIterationError;
      events: readonly string[];
    };

export const toolDependencyIterationManagerDescriptor = {
  layer: "agent_executionEngine.basic_toolLayer.toolDependency",
  capability: "dependency-iteration-management",
  defaultDryRun: true,
  defaultMaxIterations: 3,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: ToolDependencyIterationErrorCode,
  message: string,
  boundary: ToolDependencyIterationBoundary,
  cause?: Pick<ToolDependencyManagerError, "code" | "boundary" | "message">,
): ToolDependencyIterationResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
      cause,
    },
    events: ["agentCore.basicToolLayer.toolDependency.iteration.rejected"],
  };
}

function normalizeMetadata(metadata: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
  return metadata ?? {};
}

function normalizeIteration(value: number | undefined): number | ToolDependencyIterationResult {
  const iteration = value ?? 0;
  if (!Number.isInteger(iteration) || iteration < 0) {
    return failure("INVALID_ITERATION", "dependencyIterationManager currentIteration must be a non-negative integer", "input");
  }

  return iteration;
}

function normalizeMaxIterations(value: number | undefined): number | ToolDependencyIterationResult {
  const maxIterations = value ?? toolDependencyIterationManagerDescriptor.defaultMaxIterations;
  if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
    return failure("INVALID_ITERATION", "dependencyIterationManager maxIterations must be a positive integer", "input");
  }

  return maxIterations;
}

function actionForStatus(status: ToolDependencyStatus): ToolDependencyRefreshAction {
  if (status === "missing" || status === "unknown") {
    return "probe";
  }

  if (status === "stale") {
    return "refresh-version";
  }

  if (status === "conflict") {
    return "resolve-conflict";
  }

  if (status === "blocked") {
    return "request-scope";
  }

  return "manual-review";
}

function reasonForStatus(status: ToolDependencyStatus): ToolDependencyRefreshReason {
  if (status === "satisfied") {
    return "manual";
  }

  return status;
}

function shouldPlanRefresh(
  resolution: ToolDependencyResolution,
  strategy: ToolDependencyIterationStrategy,
): boolean {
  if (resolution.status === "satisfied") {
    return false;
  }

  if (!resolution.required && strategy.includeOptional !== true) {
    return false;
  }

  if (resolution.status === "missing") {
    return strategy.refreshMissing !== false;
  }

  if (resolution.status === "stale") {
    return strategy.refreshStale !== false;
  }

  if (resolution.status === "conflict" || resolution.status === "blocked") {
    return strategy.reviewConflicts !== false;
  }

  return true;
}

function buildRefreshStep(
  resolution: ToolDependencyResolution,
  strategy: ToolDependencyIterationStrategy,
): ToolDependencyRefreshStep {
  const installPlanResult =
    resolution.status === "missing" || resolution.status === "stale"
      ? planDependencyInstallation({
          dependencyId: resolution.dependencyId,
          target: strategy.installTarget ?? "praxis-managed",
          managedRoot: strategy.managedRoot,
          env: strategy.env,
          homeDir: strategy.homeDir,
        })
      : undefined;
  const installPlan = installPlanResult?.ok === true ? installPlanResult.plan : undefined;

  return {
    dependencyId: resolution.dependencyId,
    action: installPlan !== undefined ? "install" : actionForStatus(resolution.status),
    reason: reasonForStatus(resolution.status),
    required: resolution.required,
    fromStatus: resolution.status,
    requestedVersion: resolution.requestedVersion,
    observedVersion: resolution.observedVersion,
    installPlan,
    approvalRequired: installPlan?.approvalRequired ?? resolution.status === "blocked",
    notes:
      installPlanResult !== undefined && installPlanResult.ok === false
        ? [...resolution.reasons, installPlanResult.error.message]
        : resolution.reasons,
  };
}

function deriveReport(request: ToolDependencyIterationRequest): ToolDependencyReport | ToolDependencyIterationResult {
  if (request.report !== undefined) {
    return request.report;
  }

  const dependencyRequest: ToolDependencyManagerRequest = {
    toolId: request.toolId,
    declarations: request.declarations,
    context: {
      runtimeId: request.context?.runtimeId,
      invocationId: request.context?.invocationId,
      dryRun: request.context?.dryRun,
      guard: request.context?.guard,
      auditMetadata: request.context?.auditMetadata,
    },
  };
  const result = manageToolDependencies(dependencyRequest);

  if (!result.ok) {
    return failure(
      "DEPENDENCY_RESOLUTION_FAILED",
      "dependencyIterationManager could not derive dependency report",
      result.error.boundary === "permission" ? "governance" : result.error.boundary,
      result.error,
    );
  }

  return result.report;
}

export function planToolDependencyIteration(
  request: ToolDependencyIterationRequest = {},
): ToolDependencyIterationResult {
  const requestToolId = request.toolId?.trim();
  const reportToolId = request.report?.toolId.trim();
  const toolId = requestToolId || reportToolId;
  if (isBlank(toolId)) {
    return failure("MISSING_TOOL_ID", "dependencyIterationManager requires toolId", "input");
  }

  if (!isBlank(requestToolId) && !isBlank(reportToolId) && requestToolId !== reportToolId) {
    return failure(
      "TOOL_ID_MISMATCH",
      "dependencyIterationManager request toolId must match dependency report toolId",
      "contract",
    );
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_REFRESH_NOT_ALLOWED",
      "first-round dependencyIterationManager only creates a dry-run refresh plan",
      "contract",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "dependencyIterationManager was rejected by runtime governance",
      "governance",
    );
  }

  const currentIteration = normalizeIteration(request.currentIteration);
  if (typeof currentIteration !== "number") {
    return currentIteration;
  }

  const maxIterations = normalizeMaxIterations(request.strategy?.maxIterations);
  if (typeof maxIterations !== "number") {
    return maxIterations;
  }

  if (currentIteration >= maxIterations) {
    return failure(
      "ITERATION_LIMIT_REACHED",
      "dependencyIterationManager cannot plan beyond maxIterations",
      "contract",
    );
  }

  const report = deriveReport(request);
  if ("ok" in report) {
    return report;
  }

  if (report.resolutions.length === 0) {
    return failure("MISSING_DEPENDENCY_REPORT", "dependencyIterationManager requires dependency resolutions", "input");
  }

  const strategy = request.strategy ?? {};
  const refreshSteps = report.resolutions
    .filter((resolution) => shouldPlanRefresh(resolution, strategy))
    .map((resolution) => buildRefreshStep(resolution, strategy));
  const hasBlockedRequired = refreshSteps.some((step) => step.required && step.fromStatus === "blocked");
  const status =
    refreshSteps.length === 0 ? "complete" : hasBlockedRequired || report.status === "blocked" ? "blocked" : "needs-refresh";

  return {
    ok: true,
    plan: {
      toolId: toolId ?? "",
      runtimeId: request.context?.runtimeId?.trim() || report.runtimeId,
      invocationId: request.context?.invocationId?.trim() || report.invocationId,
      currentIteration,
      nextIteration: currentIteration + 1,
      maxIterations,
      status,
      sourceReportStatus: report.status,
      refreshSteps,
      dryRun: true,
      unsafeSideEffects: false,
      audit: {
        event: "agentCore.basicToolLayer.toolDependency.iteration.planned",
        metadata: normalizeMetadata(request.context?.auditMetadata),
      },
    },
    events: ["agentCore.basicToolLayer.toolDependency.iteration.planned"],
  };
}
