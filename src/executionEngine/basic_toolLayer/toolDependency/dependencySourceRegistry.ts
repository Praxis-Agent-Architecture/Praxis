import path from "node:path";

export type ToolDependencyProbeCommand = {
  command: string;
  args?: readonly string[];
};

export type ToolDependencySourceEntry = {
  sourceId: string;
  dependencyId: string;
  executableName: string;
  safety: "trusted-detect-only" | "trusted-managed" | "external";
  versionCommand?: ToolDependencyProbeCommand;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencySourceLookupResult =
  | { ok: true; source: ToolDependencySourceEntry }
  | { ok: false; error: { code: "DEPENDENCY_SOURCE_NOT_FOUND"; message: string; publicSafe: true } };

const sources: readonly ToolDependencySourceEntry[] = [
  {
    sourceId: "binary.git",
    dependencyId: "git",
    executableName: "git",
    safety: "trusted-detect-only",
    versionCommand: { command: "git", args: ["--version"] },
  },
  {
    sourceId: "binary.rg",
    dependencyId: "runtime.binary.rg",
    executableName: "rg",
    safety: "trusted-detect-only",
    versionCommand: { command: "rg", args: ["--version"] },
  },
];

export function lookupDependencySource(dependencyId: string): ToolDependencySourceLookupResult {
  const source = sources.find((candidate) => candidate.dependencyId === dependencyId);
  if (source !== undefined) return { ok: true, source };
  return {
    ok: false,
    error: {
      code: "DEPENDENCY_SOURCE_NOT_FOUND",
      message: `Dependency source ${dependencyId} is not registered`,
      publicSafe: true,
    },
  };
}

export function managedBinDir(input: {
  managedRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
} = {}): string {
  return path.join(input.managedRoot ?? input.env?.PRAXIS_MANAGED_ROOT ?? input.homeDir ?? process.cwd(), "bin");
}

export function planDependencyInstallation(input: {
  dependencyId: string;
  managedRoot?: string;
}): { dependencyId: string; approvalRequired: boolean; managedRoot?: string } {
  return {
    dependencyId: input.dependencyId,
    approvalRequired: true,
    managedRoot: input.managedRoot,
  };
}
