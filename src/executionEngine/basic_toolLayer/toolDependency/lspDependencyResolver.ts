import type { ToolDependencyDeclaration, ToolDependencyProbe } from "./dependencyManager.js";

export function declarationsFromLspProfile(): readonly ToolDependencyDeclaration[] {
  return [];
}

export function resolveLspDependency(_input: unknown): ToolDependencyProbe | undefined {
  return undefined;
}
