/*
 * Runtime provision plane / shared contracts.
 * Purpose: let developers declare capabilities while runtime prepares reusable
 * components and dependencies through the storage plane.
 */

import type { DependencyDeclaration } from "../runtime.dependencyPlane/dependencyTypes.js";
import type { RuntimeComponentSpec } from "../runtime.componentPlane/componentTypes.js";

export type CapabilityKind =
  | "sandbox"
  | "codeIntelligence"
  | "mcp"
  | "browser"
  | "office"
  | "custom";

export type CapabilityReadiness =
  | "ready"
  | "degraded"
  | "needsApproval"
  | "installing"
  | "blocked"
  | "unsupported";

export type CapabilityFallbackSpec =
  | false
  | true
  | {
      componentIds?: readonly string[];
      allowWorkspaceRollback?: boolean;
    };

export type CapabilityPolicySpec = {
  autoInstall?: boolean;
  mode?: "observe" | "prepareTrusted" | "policy";
};

export type CapabilitySpec = {
  capabilityId: string;
  kind: CapabilityKind;
  required: boolean;
  reason?: string;
  fallback: CapabilityFallbackSpec;
  componentRefs: readonly string[];
  dependencies: readonly DependencyDeclaration[];
  policy?: CapabilityPolicySpec;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CapabilityInput = Partial<Pick<CapabilitySpec, "capabilityId" | "required" | "reason" | "fallback" | "policy" | "metadata">>;

export type SandboxCapabilityInput = CapabilityInput & {
  isolation?: "none" | "workspace" | "strong" | "custom";
  providers?: Readonly<Record<string, string>>;
};

export type CodeIntelligenceCapabilityInput = CapabilityInput & {
  languages?: readonly string[];
};

export type ProvisionPlan = {
  kind: "praxis.provisionPlan";
  mode: "observe" | "prepareTrusted" | "policy";
  capabilities: readonly CapabilitySpec[];
  components: readonly RuntimeComponentSpec[];
  dependencies: readonly DependencyDeclaration[];
  readiness: CapabilityReadiness;
  missingComponents: readonly {
    capabilityId: string;
    componentId: string;
    required: boolean;
  }[];
  unsupportedComponents: readonly {
    capabilityId: string;
    componentId: string;
    required: boolean;
    platform: NodeJS.Platform;
  }[];
  events: readonly string[];
};
