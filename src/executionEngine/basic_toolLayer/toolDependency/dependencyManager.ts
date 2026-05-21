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
  available?: boolean;
  blocked?: boolean;
  version?: string;
  resolvedPath?: string;
  observedAt?: string;
  detail?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencyReport = {
  toolId: string;
  declarations: readonly ToolDependencyDeclaration[];
  probes: readonly ToolDependencyProbe[];
  resolutions: readonly {
    dependencyId: string;
    required: boolean;
    status: "satisfied" | "missing" | "blocked" | "unknown";
  }[];
  summary: {
    satisfied: number;
    missing: number;
    blocked: number;
    unknown: number;
  };
  missingDependencies: readonly string[];
  availableDependencies: readonly string[];
  blockedDependencies: readonly string[];
};

export type ToolDependencyManagerResult =
  | { ok: true; report: ToolDependencyReport; events: readonly string[] }
  | {
      ok: false;
      error: { code: string; message: string; publicSafe: true };
      events: readonly string[];
    };

export type ToolDependencyManagerRequest = {
  toolId: string;
  declarations: readonly ToolDependencyDeclaration[];
  probes?: readonly ToolDependencyProbe[];
  context?: Readonly<Record<string, unknown>>;
};

export function manageToolDependencies(request: ToolDependencyManagerRequest): ToolDependencyManagerResult {
  const probes = request.probes ?? [];
  const probeById = new Map(probes.map((probe) => [probe.dependencyId, probe]));
  const missingDependencies: string[] = [];
  const availableDependencies: string[] = [];
  const blockedDependencies: string[] = [];
  const resolutions: ToolDependencyReport["resolutions"] = request.declarations.map((declaration) => {
    const probe = probeById.get(declaration.dependencyId);
    if (probe?.blocked === true) return { dependencyId: declaration.dependencyId, required: declaration.required, status: "blocked" };
    if (probe?.available === true) return { dependencyId: declaration.dependencyId, required: declaration.required, status: "satisfied" };
    if (declaration.required) return { dependencyId: declaration.dependencyId, required: true, status: "missing" };
    return { dependencyId: declaration.dependencyId, required: false, status: "unknown" };
  });

  for (const declaration of request.declarations) {
    const probe = probeById.get(declaration.dependencyId);
    if (probe?.blocked === true) blockedDependencies.push(declaration.dependencyId);
    else if (probe?.available === true) availableDependencies.push(declaration.dependencyId);
    else if (declaration.required) missingDependencies.push(declaration.dependencyId);
  }

  return {
    ok: true,
    report: {
      toolId: request.toolId,
      declarations: request.declarations,
      probes,
      resolutions,
      summary: {
        satisfied: resolutions.filter((resolution) => resolution.status === "satisfied").length,
        missing: resolutions.filter((resolution) => resolution.status === "missing").length,
        blocked: resolutions.filter((resolution) => resolution.status === "blocked").length,
        unknown: resolutions.filter((resolution) => resolution.status === "unknown").length,
      },
      missingDependencies,
      availableDependencies,
      blockedDependencies,
    },
    events: ["agentCore.basicTool.dependencyManager.compatChecked"],
  };
}
