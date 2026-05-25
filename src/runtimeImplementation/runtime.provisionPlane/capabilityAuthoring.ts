/*
 * Runtime provision plane / capability authoring helpers.
 * Purpose: expose concise praxis.capability.* declarations for Agent authors.
 */

import type { DependencyDeclaration } from "../runtime.dependencyPlane/dependencyTypes.js";
import {
  type CapabilitySpec,
  type SandboxCapabilityInput,
  type CodeIntelligenceCapabilityInput,
} from "./provisionTypes.js";

function cap(input: Omit<CapabilitySpec, "required" | "fallback"> & Partial<Pick<CapabilitySpec, "required" | "fallback">>): CapabilitySpec {
  return {
    ...input,
    required: input.required ?? true,
    fallback: input.fallback ?? true,
    componentRefs: input.componentRefs,
    dependencies: input.dependencies,
  };
}

function dependency(dependencyId: string, kind: DependencyDeclaration["kind"], input: Omit<DependencyDeclaration, "dependencyId" | "kind"> = {}): DependencyDeclaration {
  return { dependencyId, kind, ...input };
}

function fallbackComponentRefs(
  fallback: CapabilitySpec["fallback"] | undefined,
  defaults: readonly string[],
): readonly string[] {
  if (fallback === false) return [];
  if (typeof fallback === "object") {
    return [
      ...(fallback.allowWorkspaceRollback === true ? ["component.sandbox.workspaceRollback"] : []),
      ...(fallback.componentIds ?? []),
    ];
  }
  return defaults;
}

export function capabilities(items: readonly (CapabilitySpec | DependencyDeclaration)[]): {
  capabilities: readonly CapabilitySpec[];
  dependencies: readonly DependencyDeclaration[];
} {
  const caps: CapabilitySpec[] = [];
  const deps: DependencyDeclaration[] = [];
  for (const item of items) {
    if ("capabilityId" in item) caps.push(item);
    else deps.push(item);
  }
  return { capabilities: caps, dependencies: deps };
}

export function dependencies(items: readonly DependencyDeclaration[]): readonly DependencyDeclaration[] {
  return items;
}

export const dependencyAuthoring = {
  binary(name: string, input: Omit<DependencyDeclaration, "dependencyId" | "kind"> = {}): DependencyDeclaration {
    return dependency(`dependency.binary.${name}`, "binary", input);
  },
  npm(name: string, input: Omit<DependencyDeclaration, "dependencyId" | "kind"> = {}): DependencyDeclaration {
    return dependency(`dependency.npm.${name}`, "npm", input);
  },
  dotnetTool(name: string, input: Omit<DependencyDeclaration, "dependencyId" | "kind"> = {}): DependencyDeclaration {
    return dependency(`dependency.dotnetTool.${name}`, "dotnet-tool", input);
  },
  secretRef(secretRef: string, input: Omit<DependencyDeclaration, "dependencyId" | "kind" | "secretRef"> = {}): DependencyDeclaration {
    return dependency(`dependency.secret.${secretRef.replaceAll(/[^a-zA-Z0-9_.-]/g, ".")}`, "secret-ref", { ...input, secretRef });
  },
  service(name: string, input: Omit<DependencyDeclaration, "dependencyId" | "kind"> = {}): DependencyDeclaration {
    return dependency(`dependency.service.${name}`, "service", input);
  },
  custom(dependencyId: string, input: Omit<DependencyDeclaration, "dependencyId">): DependencyDeclaration {
    return { dependencyId, ...input };
  },
} as const;

export const capability = {
  sandbox(input: SandboxCapabilityInput = {}): CapabilitySpec {
    const isolation = input.isolation ?? "strong";
    const componentRefs = isolation === "strong"
      ? [
          "component.sandbox.bubblewrap",
          "component.sandbox.appleSandbox",
          "component.sandbox.windowsSandbox",
          ...fallbackComponentRefs(input.fallback, ["component.sandbox.workspaceRollback"]),
        ]
      : isolation === "none"
        ? []
        : ["component.sandbox.workspaceRollback"];
    return cap({
      capabilityId: input.capabilityId ?? `capability.sandbox.${isolation}`,
      kind: "sandbox",
      reason: input.reason,
      required: input.required,
      fallback: input.fallback ?? true,
      componentRefs,
      dependencies: [],
      policy: input.policy,
      metadata: { isolation, providers: input.providers, platformSelection: "provision-runtime", ...(input.metadata ?? {}) },
    });
  },
  codeIntelligence(input: CodeIntelligenceCapabilityInput = {}): CapabilitySpec {
    const languages = input.languages ?? ["typescript"];
    const componentRefs = languages.map((language) => `component.lsp.${language}`);
    return cap({
      capabilityId: input.capabilityId ?? "capability.codeIntelligence",
      kind: "codeIntelligence",
      reason: input.reason,
      required: input.required,
      fallback: input.fallback ?? true,
      componentRefs,
      dependencies: [],
      policy: input.policy,
      metadata: { languages, ...(input.metadata ?? {}) },
    });
  },
  mcp(input: Omit<SandboxCapabilityInput, "isolation" | "providers"> = {}): CapabilitySpec {
    return cap({
      capabilityId: input.capabilityId ?? "capability.mcp",
      kind: "mcp",
      reason: input.reason,
      required: input.required,
      fallback: input.fallback ?? true,
      componentRefs: ["component.mcp.echoTestServer"],
      dependencies: [],
      policy: input.policy,
      metadata: input.metadata,
    });
  },
  browser(input: Omit<SandboxCapabilityInput, "isolation" | "providers"> = {}): CapabilitySpec {
    return cap({
      capabilityId: input.capabilityId ?? "capability.browser",
      kind: "browser",
      reason: input.reason,
      required: input.required,
      fallback: input.fallback ?? true,
      componentRefs: ["component.browser.playwright", "component.sandbox.workspaceRollback"],
      dependencies: [],
      policy: input.policy,
      metadata: input.metadata,
    });
  },
  office(input: Omit<SandboxCapabilityInput, "isolation" | "providers"> = {}): CapabilitySpec {
    return cap({
      capabilityId: input.capabilityId ?? "capability.office",
      kind: "office",
      reason: input.reason,
      required: input.required,
      fallback: input.fallback ?? true,
      componentRefs: ["component.office.pdf"],
      dependencies: [],
      policy: input.policy,
      metadata: input.metadata,
    });
  },
} as const;
