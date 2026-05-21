export type ToolDependencyDeclaration = {
  dependencyId: string;
  kind: "binary" | "package" | "service" | "permission" | "runtime" | "custom";
  required: boolean;
  displayName?: string;
  requiredScopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencyProbe = {
  dependencyId: string;
  available: boolean;
  status?: "available" | "missing" | "unknown";
  version?: string;
  message?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencyReport = {
  declarations: readonly ToolDependencyDeclaration[];
  probes: readonly ToolDependencyProbe[];
  missing: readonly ToolDependencyDeclaration[];
  available: readonly ToolDependencyDeclaration[];
};

export function manageToolDependencies(input: {
  declarations: readonly ToolDependencyDeclaration[];
  probes?: readonly ToolDependencyProbe[];
}): ToolDependencyReport {
  const probes = input.probes ?? [];
  const availableIds = new Set(probes.filter((probe) => probe.available).map((probe) => probe.dependencyId));
  return {
    declarations: input.declarations,
    probes,
    missing: input.declarations.filter((item) => !availableIds.has(item.dependencyId)),
    available: input.declarations.filter((item) => availableIds.has(item.dependencyId)),
  };
}
