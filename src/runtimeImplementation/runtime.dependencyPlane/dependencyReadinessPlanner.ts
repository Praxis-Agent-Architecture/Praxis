/*
 * Runtime dependency plane / readiness planner.
 * Purpose: classify dependency probes into prepare/approval/blocking work.
 */

import type {
  DependencyDeclaration,
  DependencyPlaneContext,
  DependencyReadinessStatus,
} from "./dependencyTypes.js";
import { canonicalDependencyId } from "./dependencyTypes.js";
import { lookupDependencySource, type DependencySourceRegistry } from "./dependencySourceRegistry.js";
import { probeDependency } from "./dependencyProbeRunner.js";

export type DependencyPrepareMode = "observe" | "prepareTrusted" | "policy";

export type DependencyReadinessStep = {
  dependencyId: string;
  action: "probe" | "install" | "approve" | "none";
  approvalRequired: boolean;
  status: DependencyReadinessStatus;
  reason: string;
};

export type DependencyReadinessPlan = {
  status: DependencyReadinessStatus;
  steps: readonly DependencyReadinessStep[];
  missingDependencies: readonly string[];
  installableDependencies: readonly string[];
  approvalRequiredDependencies: readonly string[];
  unknownDependencies: readonly string[];
  events: readonly string[];
};

function missingRequiredScopes(
  declaration: DependencyDeclaration,
  allowedScopes: readonly string[] | undefined,
): readonly string[] {
  const requiredScopes = [...new Set((declaration.requiredScopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
  if (requiredScopes.length === 0 || allowedScopes === undefined) return [];
  const allowed = new Set(allowedScopes.map((scope) => scope.trim()).filter(Boolean));
  return requiredScopes.filter((scope) => !allowed.has(scope));
}

function versionMismatchReason(
  declaration: DependencyDeclaration,
  observedVersion: string | undefined,
): string | undefined {
  if (declaration.version !== undefined && observedVersion !== declaration.version) {
    return `dependency ${canonicalDependencyId(declaration.dependencyId)} observed version ${observedVersion ?? "unknown"} does not match requested version ${declaration.version}`;
  }
  if (declaration.acceptedVersions !== undefined && (observedVersion === undefined || !declaration.acceptedVersions.includes(observedVersion))) {
    return `dependency ${canonicalDependencyId(declaration.dependencyId)} observed version ${observedVersion ?? "unknown"} is not in accepted versions: ${declaration.acceptedVersions.join(", ")}`;
  }
  return undefined;
}

export async function planDependencyReadiness(input: {
  declarations: readonly DependencyDeclaration[];
  mode?: DependencyPrepareMode;
  context?: DependencyPlaneContext;
  registry?: DependencySourceRegistry;
}): Promise<DependencyReadinessPlan> {
  const mode = input.mode ?? "observe";
  const steps: DependencyReadinessStep[] = [];
  const missing: string[] = [];
  const installable: string[] = [];
  const requiredInstallable: string[] = [];
  const approval: string[] = [];
  const unknown: string[] = [];
  for (const declaration of input.declarations) {
    const dependencyId = canonicalDependencyId(declaration.dependencyId);
    const required = declaration.required !== false;
    const deniedScopes = missingRequiredScopes(declaration, input.context?.allowedScopes);
    if (deniedScopes.length > 0) {
      if (required) missing.push(dependencyId);
      steps.push({
        dependencyId,
        action: "probe",
        approvalRequired: false,
        status: "blocked",
        reason: `dependency requires scopes not granted by this invocation: ${deniedScopes.join(", ")}`,
      });
      continue;
    }
    const source = lookupDependencySource(dependencyId, input.registry);
    if (!source.ok) {
      if (required) unknown.push(dependencyId);
      steps.push({ dependencyId, action: "probe", approvalRequired: false, status: "unknown", reason: source.error.message });
      continue;
    }
    const probe = await probeDependency({ dependencyId, source: source.value, context: input.context, registry: input.registry });
    if (probe.available) {
      const mismatchReason = versionMismatchReason(declaration, probe.version);
      if (mismatchReason !== undefined) {
        if (required) missing.push(dependencyId);
        steps.push({ dependencyId, action: "probe", approvalRequired: false, status: "blocked", reason: mismatchReason });
        continue;
      }
      steps.push({ dependencyId, action: "none", approvalRequired: false, status: "available", reason: "dependency is available" });
      continue;
    }
    if (source.value.managedInstall !== undefined && source.value.safety === "trusted-managed") {
      const installPolicy = declaration.install ?? "auto";
      if (installPolicy === "disabled") {
        if (required) missing.push(dependencyId);
        steps.push({
          dependencyId,
          action: "probe",
          approvalRequired: false,
          status: "blocked",
          reason: "dependency install is disabled by declaration",
        });
        continue;
      }
      installable.push(dependencyId);
      if (!required) {
        steps.push({
          dependencyId,
          action: "none",
          approvalRequired: false,
          status: "installable",
          reason: "optional trusted managed dependency can be prepared",
        });
        continue;
      }
      requiredInstallable.push(dependencyId);
      if (installPolicy === "manual") {
        approval.push(dependencyId);
        steps.push({
          dependencyId,
          action: "approve",
          approvalRequired: true,
          status: "installable",
          reason: "dependency requires manual preparation before runtime use",
        });
        continue;
      }
      steps.push({
        dependencyId,
        action: mode === "observe" ? "approve" : "install",
        approvalRequired: mode === "observe",
        status: "installable",
        reason: "trusted managed dependency can be prepared",
      });
      if (mode === "observe") approval.push(dependencyId);
      continue;
    }
    if (required) missing.push(dependencyId);
    steps.push({
      dependencyId,
      action: "probe",
      approvalRequired: false,
      status: probe.status ?? "missing",
      reason: probe.message ?? "dependency is missing",
    });
  }
  const status: DependencyReadinessStatus = unknown.length > 0
    ? "unknown"
    : missing.length > 0
      ? "blocked"
    : approval.length > 0
      ? "requiresApproval"
      : requiredInstallable.length > 0
        ? "installable"
        : "available";
  return {
    status,
    steps,
    missingDependencies: missing,
    installableDependencies: installable,
    approvalRequiredDependencies: approval,
    unknownDependencies: unknown,
    events: ["runtime.dependency.readiness.planned"],
  };
}
