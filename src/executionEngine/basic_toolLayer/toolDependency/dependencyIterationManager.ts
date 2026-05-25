/*
 * 文件定位：Agent 执行引擎 / basic_toolLayer / toolDependency / dependencyIterationManager。
 * 核心目的：兼容旧 dependency refresh plan，并使用 runtime dependency source 生成 trusted managed install plan。
 * 能力要求1：从 report 或 declarations 生成下一轮 probe/install/refresh-version 步骤。
 * 能力要求2：保持 dry-run，不执行刷新。
 * 边界：真实安装由 runtime.dependencyPlane installer 处理。
 * 对接：dependencyManager 与 runtime.dependencyPlane。
 * 实现提示：旧测试依赖 descriptor 与 ok/plan 形状。
 */

import { planDependencyInstallation } from "./dependencySourceRegistry.js";
import { manageToolDependencies, type ToolDependencyDeclaration, type ToolDependencyReport } from "./dependencyManager.js";

export const toolDependencyIterationManagerDescriptor = {
  surface: "agent.executionEngine.basicToolLayer.toolDependency.iterationManager",
  defaultDryRun: true,
} as const;

export function planToolDependencyIteration(input: {
  toolId?: string;
  currentIteration?: number;
  report?: ToolDependencyReport;
  declarations?: readonly ToolDependencyDeclaration[];
  context?: { runtimeId?: string; dryRun?: boolean };
  strategy?: { maxIterations?: number; managedRoot?: string };
}) {
  const currentIteration = input.currentIteration ?? 0;
  if (currentIteration < 0) {
    return { ok: false as const, error: { code: "INVALID_ITERATION", boundary: "input" as const, publicSafe: true }, events: ["toolDependency.iteration.rejected"] };
  }
  if (input.strategy?.maxIterations !== undefined && currentIteration >= input.strategy.maxIterations) {
    return { ok: false as const, error: { code: "ITERATION_LIMIT_REACHED", boundary: "contract" as const, publicSafe: true }, events: ["toolDependency.iteration.rejected"] };
  }
  if (input.context?.dryRun === false) {
    return { ok: false as const, error: { code: "REAL_REFRESH_NOT_ALLOWED", boundary: "contract" as const, publicSafe: true }, events: ["toolDependency.iteration.rejected"] };
  }
  const report = input.report ?? (() => {
    const generated = manageToolDependencies({ toolId: input.toolId ?? "unknown.tool", declarations: input.declarations ?? [] });
    return generated.ok ? { ...generated.report, status: "unknown" as const } : undefined;
  })();
  if (report === undefined) {
    return { ok: false as const, error: { code: "MISSING_REPORT", boundary: "input" as const, publicSafe: true }, events: ["toolDependency.iteration.rejected"] };
  }
  if (input.toolId !== undefined && input.toolId.trim().length > 0 && report.toolId !== input.toolId.trim()) {
    return { ok: false as const, error: { code: "TOOL_ID_MISMATCH", boundary: "contract" as const, publicSafe: true }, events: ["toolDependency.iteration.rejected"] };
  }
  const refreshSteps = report.resolutions
    .filter((resolution) => resolution.status !== "satisfied" && (resolution.required || resolution.status === "stale"))
    .map((resolution) => {
      if (resolution.status === "missing") {
        const install = planDependencyInstallation({ dependencyId: resolution.dependencyId, managedRoot: input.strategy?.managedRoot });
        if (install.ok) {
          return {
            dependencyId: resolution.dependencyId,
            action: "install" as const,
            approvalRequired: install.plan.approvalRequired,
            installPlan: install.plan,
            reason: "dependency can be installed",
          };
        }
        return { dependencyId: resolution.dependencyId, action: "probe" as const, approvalRequired: false, reason: "dependency is missing" };
      }
      if (resolution.status === "stale") {
        return { dependencyId: resolution.dependencyId, action: "refresh-version" as const, approvalRequired: false, reason: "dependency version is stale" };
      }
      if (resolution.status === "blocked" || resolution.status === "conflict") {
        return { dependencyId: resolution.dependencyId, action: "request-scope" as const, approvalRequired: true, reason: `dependency is ${resolution.status}` };
      }
      return { dependencyId: resolution.dependencyId, action: "probe" as const, approvalRequired: false, reason: `dependency is ${resolution.status}` };
    });
  const status = refreshSteps.some((step) => step.action === "request-scope")
    ? "blocked"
    : refreshSteps.length > 0
      ? "needs-refresh"
      : "complete";
  return {
    ok: true as const,
    plan: {
      status,
      sourceReportStatus: report.status,
      currentIteration,
      nextIteration: currentIteration + 1,
      dryRun: true,
      unsafeSideEffects: false,
      refreshSteps,
    },
    events: ["toolDependency.iteration.planned"],
  };
}
