export type ToolDependencyProbeCommand = {
  command: string;
  args?: readonly string[];
};

export type ToolDependencySourceEntry = {
  dependencyId: string;
  trusted: boolean;
  probe?: ToolDependencyProbeCommand;
};

export function managedBinDir(input: { managedRoot?: string; env?: Readonly<Record<string, string | undefined>>; homeDir?: string } = {}): string {
  return input.managedRoot ?? input.env?.PRAXIS_TOOL_HOME ?? `${input.homeDir ?? process.env.HOME ?? "."}/.praxis/tools/bin`;
}

export function lookupDependencySource(dependencyId: string): ToolDependencySourceEntry | undefined {
  return { dependencyId, trusted: false };
}

export function planDependencyInstallation(input: { dependencyId: string }) {
  return {
    dependencyId: input.dependencyId,
    installable: false,
    requiresApproval: true,
    reason: "No managed dependency source is registered for the semantic basetool layer yet.",
  };
}
