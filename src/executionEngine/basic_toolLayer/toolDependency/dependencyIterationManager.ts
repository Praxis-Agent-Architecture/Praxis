import type { ToolDependencyDeclaration, ToolDependencyReport } from "./dependencyManager.js";

export type ToolDependencyRefreshStep = {
  dependencyId: string;
  reason: string;
  approvalRequired?: boolean;
  installPlan?: {
    dependencyId: string;
    approvalRequired: boolean;
    metadata?: Readonly<Record<string, unknown>>;
  };
};

export type ToolDependencyIterationPlan = {
  toolId: string;
  refreshSteps: readonly ToolDependencyRefreshStep[];
  events: readonly string[];
};

export type ToolDependencyIterationRequest = {
  toolId: string;
  declarations?: readonly ToolDependencyDeclaration[];
  report: ToolDependencyReport;
  strategy?: Readonly<Record<string, unknown>>;
  context?: Readonly<Record<string, unknown>>;
};

export type ToolDependencyIterationResult =
  | { ok: true; plan: ToolDependencyIterationPlan; events: readonly string[] }
  | { ok: false; error: { code: string; message: string; publicSafe: true }; events: readonly string[] };

export function planToolDependencyIteration(request: ToolDependencyIterationRequest): ToolDependencyIterationResult {
  return {
    ok: true,
    plan: {
      toolId: request.toolId,
      refreshSteps: request.report.missingDependencies.map((dependencyId) => ({
        dependencyId,
        approvalRequired: true,
        reason: "dependency is missing in the transitional compatibility manager",
        installPlan: { dependencyId, approvalRequired: true },
      })),
      events: ["agentCore.basicTool.dependencyIteration.compatPlanned"],
    },
    events: ["agentCore.basicTool.dependencyIteration.compatPlanned"],
  };
}
