export type ToolDependencyRefreshStep = {
  dependencyId: string;
  action: "probe" | "install" | "approve";
  reason: string;
};

export type ToolDependencyIterationPlan = {
  steps: readonly ToolDependencyRefreshStep[];
  requiresApproval: boolean;
};

export function planToolDependencyIteration(input: {
  missingDependencies?: readonly string[];
  installableDependencies?: readonly string[];
  approvalRequiredDependencies?: readonly string[];
}): ToolDependencyIterationPlan {
  const approval = input.approvalRequiredDependencies ?? [];
  const installable = input.installableDependencies ?? [];
  const missing = input.missingDependencies ?? [];
  return {
    steps: [
      ...approval.map((dependencyId) => ({ dependencyId, action: "approve" as const, reason: "dependency requires approval" })),
      ...installable.map((dependencyId) => ({ dependencyId, action: "install" as const, reason: "dependency can be installed" })),
      ...missing.map((dependencyId) => ({ dependencyId, action: "probe" as const, reason: "dependency is missing" })),
    ],
    requiresApproval: approval.length > 0,
  };
}
