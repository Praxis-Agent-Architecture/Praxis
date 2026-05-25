/*
 * Runtime component plane / shared contracts.
 * Purpose: map capabilities to reusable runtime components and dependencies.
 */

import type { DependencyDeclaration } from "../runtime.dependencyPlane/dependencyTypes.js";

export type RuntimeComponentKind =
  | "sandbox"
  | "lsp"
  | "mcp"
  | "browser"
  | "office"
  | "tool-support"
  | "custom";

export type RuntimeComponentSpec = {
  componentId: string;
  kind: RuntimeComponentKind;
  title?: string;
  dependencies: readonly DependencyDeclaration[];
  capabilities?: readonly string[];
  fallbackComponentIds?: readonly string[];
  supportedPlatforms?: readonly NodeJS.Platform[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ComponentSelection = {
  capabilityId: string;
  primaryComponentId: string;
  componentIds: readonly string[];
  dependencyIds: readonly string[];
  fallbackAllowed: boolean;
};
