/*
 * Runtime provision plane / planner.
 * Purpose: expand capability declarations into components and dependencies,
 * deduplicate shared requirements, and report readiness mode.
 */

import {
  canonicalDependencyId,
  dependencyKindFromId,
  type DependencyDeclaration,
} from "../runtime.dependencyPlane/dependencyTypes.js";
import {
  createRuntimeComponentRegistry,
  lookupRuntimeComponent,
  type RuntimeComponentRegistry,
} from "../runtime.componentPlane/runtimeComponentRegistry.js";
import type { RuntimeComponentSpec } from "../runtime.componentPlane/componentTypes.js";
import type { CapabilitySpec, ProvisionPlan } from "./provisionTypes.js";

export const provisionRuntimeDescriptor = {
  surface: "runtime.provisionPlane",
  expandsCapabilities: true,
  deduplicatesComponents: true,
} as const;

function uniqueBy<TValue>(values: readonly TValue[], key: (value: TValue) => string): readonly TValue[] {
  const seen = new Set<string>();
  const result: TValue[] = [];
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(value);
  }
  return result;
}

function expandFallbacks(component: RuntimeComponentSpec, registry: RuntimeComponentRegistry): readonly RuntimeComponentSpec[] {
  return (component.fallbackComponentIds ?? [])
    .map((componentId) => lookupRuntimeComponent(componentId, registry))
    .filter((item): item is RuntimeComponentSpec => item !== undefined);
}

function expandCapabilityFallbacks(
  capability: CapabilitySpec,
  component: RuntimeComponentSpec,
  registry: RuntimeComponentRegistry,
): readonly RuntimeComponentSpec[] {
  if (capability.fallback === false) return [];
  const componentFallbacks = expandFallbacks(component, registry);
  if (typeof capability.fallback !== "object") return componentFallbacks;
  const defaultFallbacks = capability.fallback.allowWorkspaceRollback === false
    ? componentFallbacks.filter((fallback) => fallback.componentId !== "component.sandbox.workspaceRollback")
    : componentFallbacks;
  const explicitFallbacks = (capability.fallback.componentIds ?? [])
    .map((componentId) => lookupRuntimeComponent(componentId, registry))
    .filter((item): item is RuntimeComponentSpec => item !== undefined);
  return [...defaultFallbacks, ...explicitFallbacks];
}

function componentSupportsPlatform(component: RuntimeComponentSpec, platform: NodeJS.Platform): boolean {
  return component.supportedPlatforms === undefined || component.supportedPlatforms.includes(platform);
}

function normalizedDependencyKind(dependency: DependencyDeclaration, dependencyId: string): DependencyDeclaration["kind"] {
  if (dependency.kind !== "custom") return dependency.kind;
  const inferred = dependencyKindFromId(dependencyId);
  if (inferred !== "runtime") return inferred;
  const original = dependency.dependencyId.trim();
  const canonicalizedFromLegacyId = dependencyId !== original;
  if (canonicalizedFromLegacyId || dependencyId.startsWith("dependency.runtime.")) return inferred;
  return "custom";
}

function normalizeDependency(dependency: DependencyDeclaration): DependencyDeclaration {
  const dependencyId = canonicalDependencyId(dependency.dependencyId);
  return {
    ...dependency,
    dependencyId,
    required: dependency.required ?? true,
    kind: normalizedDependencyKind(dependency, dependencyId),
  };
}

function mergeDependencyKind(
  current: DependencyDeclaration["kind"],
  incoming: DependencyDeclaration["kind"],
): DependencyDeclaration["kind"] {
  if (current === incoming) return current;
  if (current === "custom") return incoming;
  if (incoming === "custom") return current;
  return current;
}

function mergeTextList(...lists: readonly (readonly (string | undefined)[] | undefined)[]): readonly string[] | undefined {
  const merged = [...new Set(lists.flatMap((list) => list ?? []).filter((value): value is string => value !== undefined && value.trim().length > 0))];
  return merged.length > 0 ? merged : undefined;
}

function mergeDependencyDeclaration(
  current: DependencyDeclaration,
  incoming: DependencyDeclaration,
): DependencyDeclaration {
  return {
    ...current,
    required: current.required === true || incoming.required === true,
    kind: mergeDependencyKind(current.kind, incoming.kind),
    version: current.version ?? incoming.version,
    acceptedVersions: mergeTextList(current.acceptedVersions, incoming.acceptedVersions),
    install: current.install ?? incoming.install,
    sourceRef: current.sourceRef ?? incoming.sourceRef,
    requiredScopes: mergeTextList(current.requiredScopes, incoming.requiredScopes),
    secretRef: current.secretRef ?? incoming.secretRef,
    reason: mergeTextList([current.reason], [incoming.reason])?.join("; "),
    metadata: {
      ...(current.metadata ?? {}),
      ...(incoming.metadata ?? {}),
    },
  };
}

function deduplicateDependencies(input: readonly DependencyDeclaration[]): readonly DependencyDeclaration[] {
  const byId = new Map<string, DependencyDeclaration>();
  for (const dependency of input.map(normalizeDependency)) {
    const current = byId.get(dependency.dependencyId);
    byId.set(
      dependency.dependencyId,
      current === undefined ? dependency : mergeDependencyDeclaration(current, dependency),
    );
  }
  return [...byId.values()];
}

export function createProvisionPlan(input: {
  capabilities?: readonly CapabilitySpec[];
  dependencies?: readonly DependencyDeclaration[];
  registry?: RuntimeComponentRegistry;
  mode?: ProvisionPlan["mode"];
  platform?: NodeJS.Platform;
}): ProvisionPlan {
  const registry = input.registry ?? createRuntimeComponentRegistry();
  const officialRegistry = createRuntimeComponentRegistry();
  const platform = input.platform ?? process.platform;
  const selected: RuntimeComponentSpec[] = [];
  const missingComponents: { capabilityId: string; componentId: string; required: boolean }[] = [];
  const unsupportedComponents: { capabilityId: string; componentId: string; required: boolean; platform: NodeJS.Platform }[] = [];
  for (const capability of input.capabilities ?? []) {
    const unsupportedForCapability: { capabilityId: string; componentId: string; required: boolean; platform: NodeJS.Platform }[] = [];
    let selectedForCapability = 0;
    for (const componentId of capability.componentRefs) {
      const component = lookupRuntimeComponent(componentId, registry);
      if (component !== undefined) {
        if (!componentSupportsPlatform(component, platform)) {
          unsupportedForCapability.push({
            capabilityId: capability.capabilityId,
            componentId,
            required: capability.required,
            platform,
          });
          continue;
        }
        selected.push(component);
        selectedForCapability += 1;
        selected.push(...expandCapabilityFallbacks(capability, component, registry).filter((fallback) => componentSupportsPlatform(fallback, platform)));
      } else {
        const officialComponent = lookupRuntimeComponent(componentId, officialRegistry);
        if (officialComponent !== undefined && !componentSupportsPlatform(officialComponent, platform)) {
          unsupportedForCapability.push({
            capabilityId: capability.capabilityId,
            componentId,
            required: capability.required,
            platform,
          });
          continue;
        }
        missingComponents.push({
          capabilityId: capability.capabilityId,
          componentId,
          required: capability.required,
        });
      }
    }
    if (selectedForCapability === 0 && unsupportedForCapability.length > 0) {
      unsupportedComponents.push(...unsupportedForCapability);
    }
  }
  const components = uniqueBy(selected, (component) => component.componentId);
  const dependencies = deduplicateDependencies([
    ...(input.dependencies ?? []),
    ...(input.capabilities ?? []).flatMap((capability) => capability.dependencies),
    ...components.flatMap((component) => component.dependencies),
  ]);
  const readiness: ProvisionPlan["readiness"] = missingComponents.some((component) => component.required)
    ? "blocked"
    : unsupportedComponents.some((component) => component.required)
      ? "unsupported"
    : missingComponents.length > 0
      ? "degraded"
      : "ready";
  return {
    kind: "praxis.provisionPlan",
    mode: input.mode ?? "observe",
    capabilities: input.capabilities ?? [],
    components,
    dependencies,
    readiness,
    missingComponents,
    unsupportedComponents,
    events: [
      "runtime.provision.capability.probe.started",
      "runtime.provision.component.selected",
      ...(missingComponents.length > 0 ? ["runtime.provision.component.missing"] : []),
      ...(unsupportedComponents.length > 0 ? ["runtime.provision.component.unsupported"] : []),
    ],
  };
}
