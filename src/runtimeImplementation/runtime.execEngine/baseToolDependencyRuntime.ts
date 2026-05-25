import type {
  BaseToolRuntimeReadinessPreflight,
  BaseToolSupportCatalogEntry,
  BaseToolSupportCatalogOptions,
} from "./baseToolSupportCatalog.js";
import {
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
} from "./baseToolSupportCatalog.js";
import {
  canonicalDependencyId,
  declarationsFromLspProfile,
  ensureDependencyAvailable,
  lookupDependencySource,
  probeDependency,
  resolveLspDependency,
  type DependencyDeclaration,
  type DependencyPlaneContext,
  type DependencyProbe,
  type DependencyReadinessStatus,
} from "../runtime.dependencyPlane/index.js";

export type BaseToolDependencyRuntimeStatus =
  | "available"
  | "missing"
  | "installable"
  | "installing"
  | "installed"
  | "requiresApproval"
  | "blocked"
  | "providerUnavailable"
  | "unknown";

export type BaseToolDependencyRuntimeDecision = "ready" | "requiresApproval" | "blocked";

export type BaseToolDependencyRuntimeMode = "observe" | "auto" | "full" | "autoInstallTrustedManaged";

export type ToolDependencyProbe = {
  dependencyId: string;
  available?: boolean;
  status?: BaseToolDependencyRuntimeStatus | string;
  version?: string;
  message?: string;
  metadata?: Readonly<Record<string, unknown>>;
  [key: string]: unknown;
};

export type ToolDependencyResolution = {
  dependencyId: string;
  status: BaseToolDependencyRuntimeStatus;
  required: boolean;
  observedVersion?: string;
  resolvedPath?: string;
  detail?: string;
};

export type ToolDependencyReport = {
  toolId: string;
  dependencies: readonly string[];
  probes: readonly ToolDependencyProbe[];
  resolutions: readonly ToolDependencyResolution[];
  missingDependencies: readonly string[];
  approvalRequiredDependencies: readonly string[];
  providerUnavailableDependencies: readonly string[];
  events: readonly string[];
  [key: string]: unknown;
};

export type ToolDependencyRefreshStep = {
  dependencyId: string;
  action: "probe" | "approve" | "install";
  reason: string;
};

export type ToolDependencyIterationPlan = {
  refreshSteps: readonly ToolDependencyRefreshStep[];
  requiresApproval: boolean;
  events: readonly string[];
  [key: string]: unknown;
};

export type EnsureDependencyAvailableResult = {
  ok: boolean;
  dependencyId: string;
  availability: {
    dependencyId: string;
    status: BaseToolDependencyRuntimeStatus;
    available: boolean;
    version?: string;
    resolvedPath?: string;
    installedNow?: boolean;
  };
  events: readonly string[];
  error?: { code: string; message: string; publicSafe: true };
  [key: string]: unknown;
};

export type BaseToolDependencyRuntimeContext = {
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  toolId: string;
  toolInput?: unknown;
  governanceAccepted?: boolean;
  allowedScopes?: readonly string[];
  mode?: BaseToolDependencyRuntimeMode;
  managedRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
  timeoutMs?: number;
};

export type BaseToolDependencyRuntimeRequest = BaseToolSupportCatalogOptions & {
  context: BaseToolDependencyRuntimeContext;
  readiness?: BaseToolRuntimeReadinessPreflight;
  catalogEntry?: BaseToolSupportCatalogEntry;
  probes?: readonly ToolDependencyProbe[];
};

export type BaseToolDependencyRuntimeResult = {
  kind: "runtime.execEngine.baseToolDependencyRuntime.result";
  toolId: string;
  decision: BaseToolDependencyRuntimeDecision;
  status: BaseToolDependencyRuntimeStatus;
  report?: ToolDependencyReport;
  iterationPlan?: ToolDependencyIterationPlan;
  installResults: readonly EnsureDependencyAvailableResult[];
  missingDependencies: readonly string[];
  installableDependencies: readonly string[];
  approvalRequiredDependencies: readonly string[];
  providerUnavailableDependencies: readonly string[];
  events: readonly string[];
  reason: string;
  publicSafe: true;
};

function probeAvailable(probes: readonly ToolDependencyProbe[], dependencyId: string): boolean {
  const canonical = canonicalDependencyId(dependencyId);
  return probes.some((probe) => canonicalDependencyId(probe.dependencyId) === canonical && (probe.available === true || probe.status === "available"));
}

function findAvailableProbe(probes: readonly ToolDependencyProbe[], dependencyId: string): ToolDependencyProbe | undefined {
  const canonical = canonicalDependencyId(dependencyId);
  return probes.find((probe) => canonicalDependencyId(probe.dependencyId) === canonical && (probe.available === true || probe.status === "available"));
}

function versionMismatchReason(
  dependency: DependencyDeclaration,
  observedVersion: string | undefined,
): string | undefined {
  const dependencyId = canonicalDependencyId(dependency.dependencyId);
  if (dependency.version !== undefined && observedVersion !== dependency.version) {
    return `dependency ${dependencyId} observed version ${observedVersion ?? "unknown"} does not match requested version ${dependency.version}`;
  }
  if (dependency.acceptedVersions !== undefined && (observedVersion === undefined || !dependency.acceptedVersions.includes(observedVersion))) {
    return `dependency ${dependencyId} observed version ${observedVersion ?? "unknown"} is not in accepted versions: ${dependency.acceptedVersions.join(", ")}`;
  }
  return undefined;
}

function mapDependencyKind(kind: string): DependencyDeclaration["kind"] {
  if (kind === "package") return "npm";
  if (kind === "mcp-server") return "mcp-server";
  if (kind === "permission") return "permission";
  if (kind === "service") return "service";
  if (kind === "binary") return "binary";
  if (kind === "runtime") return "runtime";
  return "custom";
}

function toDependencyDeclarations(input: {
  entry?: BaseToolSupportCatalogEntry;
  context: BaseToolDependencyRuntimeContext;
}): readonly DependencyDeclaration[] {
  const declared = (input.entry?.dependencies ?? []).map((dependency): DependencyDeclaration => ({
    dependencyId: canonicalDependencyId(dependency.dependencyId),
    kind: mapDependencyKind(dependency.kind),
    required: dependency.required,
    version: dependency.version,
    acceptedVersions: dependency.acceptedVersions,
    install: dependency.install,
    sourceRef: dependency.sourceRef,
    requiredScopes: dependency.requiredScopes,
    secretRef: dependency.secretRef,
    reason: dependency.description,
    metadata: dependency.metadata,
  }));
  const toolInput = input.context.toolInput as { target?: { filePath?: string; languageId?: string } } | undefined;
  if (toolInput?.target !== undefined) {
    const lsp = resolveLspDependency({ target: toolInput.target });
    if (lsp.ok) return [...declared, ...declarationsFromLspProfile(lsp.value.profile)];
  }
  return declared;
}

function isRuntimeExecutorDependency(dependencyId: string): boolean {
  return canonicalDependencyId(dependencyId).startsWith("runtime.executor.");
}

function toDependencyPlaneContext(context: BaseToolDependencyRuntimeContext): DependencyPlaneContext {
  return {
    runtimeId: context.runtimeId,
    sessionId: context.sessionId,
    invocationId: context.invocationId,
    managedRoot: context.managedRoot,
    env: context.env,
    homeDir: context.homeDir,
    installTimeoutMs: context.timeoutMs,
    allowedScopes: context.allowedScopes,
  };
}

function toProbe(input: DependencyProbe): ToolDependencyProbe {
  return {
    dependencyId: input.dependencyId,
    available: input.available,
    status: input.status,
    version: input.version,
    message: input.message,
    metadata: {
      resolvedPath: input.resolvedPath,
      observedAt: input.observedAt,
    },
  };
}

function toRuntimeStatus(status: DependencyReadinessStatus | undefined): BaseToolDependencyRuntimeStatus {
  if (status === "unsupported") return "blocked";
  return status ?? "unknown";
}

function missingRequiredScopes(
  dependency: DependencyDeclaration,
  allowedScopes: readonly string[] | undefined,
): readonly string[] {
  const requiredScopes = [...new Set((dependency.requiredScopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
  if (requiredScopes.length === 0 || allowedScopes === undefined) return [];
  const allowed = new Set(allowedScopes.map((scope) => scope.trim()).filter(Boolean));
  return requiredScopes.filter((scope) => !allowed.has(scope));
}

function readinessFromEntry(toolId: string, entry: BaseToolSupportCatalogEntry): BaseToolRuntimeReadinessPreflight {
  const blockingSupports = entry.requiredSupports.filter((support) => support.status === "unavailable" || support.status === "disabled" || support.status === "notImplemented");
  const approvalSupports = entry.requiredSupports.filter((support) => support.status === "requiresApproval");
  const decision: BaseToolRuntimeReadinessPreflight["decision"] = blockingSupports.length > 0 ? "blocked" : approvalSupports.length > 0 ? "requiresApproval" : "allowed";
  return {
    toolId,
    found: true,
    decision,
    readiness: entry.readiness,
    entry,
    blockingSupports,
    approvalSupports,
    advisorySupports: entry.requiredSupports.filter((support) => !blockingSupports.includes(support) && !approvalSupports.includes(support)),
    events: [`basetool.supportCatalog.preflight.${decision}`],
    reason: decision === "allowed"
      ? `basetool ${toolId} has required runtime support available`
      : decision === "requiresApproval"
        ? `basetool ${toolId} requires runtime approval`
        : `basetool ${toolId} is missing runtime support`,
  };
}

function makeReport(input: {
  toolId: string;
  dependencies: readonly DependencyDeclaration[];
  probes: readonly ToolDependencyProbe[];
  resolutions: readonly ToolDependencyResolution[];
  missingDependencies: readonly string[];
  approvalRequiredDependencies: readonly string[];
  providerUnavailableDependencies: readonly string[];
}): ToolDependencyReport {
  return {
    toolId: input.toolId,
    dependencies: input.dependencies.map((dependency) => dependency.dependencyId),
    probes: input.probes,
    resolutions: input.resolutions,
    missingDependencies: input.missingDependencies,
    approvalRequiredDependencies: input.approvalRequiredDependencies,
    providerUnavailableDependencies: input.providerUnavailableDependencies,
    events: ["runtime.baseTool.dependencies.reported"],
  };
}

function dependencyFailureReason(input: {
  toolId: string;
  missingDependencies: readonly string[];
  installResults: readonly EnsureDependencyAvailableResult[];
}): string | undefined {
  const failedInstalls = input.installResults.filter((result) => result.ok === false);
  if (failedInstalls.length > 0) {
    return `basetool ${input.toolId} failed to prepare dependencies: ${failedInstalls
      .map((result) => `${result.dependencyId}: ${result.error?.message ?? "dependency install failed"}`)
      .join(", ")}`;
  }
  if (input.missingDependencies.length > 0) {
    return `basetool ${input.toolId} has unsatisfied dependencies: ${input.missingDependencies.join(", ")}`;
  }
  return undefined;
}

export async function preflightBaseToolDependencies(
  request: BaseToolDependencyRuntimeRequest,
): Promise<BaseToolDependencyRuntimeResult> {
  const toolId = request.context.toolId.trim();
  const providedEntry = request.catalogEntry;
  const evaluatedReadiness = request.readiness ?? evaluateBaseToolRuntimeReadiness({ ...request, toolId });
  const entry = providedEntry ?? evaluatedReadiness.entry ?? createBaseToolSupportCatalog(request).find((candidate) => candidate.toolId === toolId);
  const readiness: BaseToolRuntimeReadinessPreflight = request.readiness ?? (
    providedEntry === undefined
      ? evaluatedReadiness
      : readinessFromEntry(toolId, providedEntry)
  );
  const dependencies = toDependencyDeclarations({ entry, context: request.context });
  const probes: ToolDependencyProbe[] = [...(request.probes ?? []).map((probe) => ({ ...probe, dependencyId: canonicalDependencyId(probe.dependencyId) }))];
  const approvalRequiredDependencies = readiness.approvalSupports.map((support) => support.dependencyId);
  const providerUnavailableDependencies = readiness.blockingSupports.map((support) => support.dependencyId);
  if (request.context.governanceAccepted === false) {
    approvalRequiredDependencies.push("runtime.governancePlane.workspaceReadScope");
  }
  const installableDependencies: string[] = [];
  const requiredInstallableDependencies: string[] = [];
  const missingDependencies: string[] = [];
  const resolutions: ToolDependencyResolution[] = [];
  const installResults: EnsureDependencyAvailableResult[] = [];
  const allowInstall = request.context.mode === "auto" || request.context.mode === "full" || request.context.mode === "autoInstallTrustedManaged";

  for (const dependency of dependencies) {
    const dependencyId = canonicalDependencyId(dependency.dependencyId);
    const required = dependency.required !== false;
    const deniedScopes = missingRequiredScopes(dependency, request.context.allowedScopes);
    if (deniedScopes.length > 0) {
      if (required) missingDependencies.push(dependencyId);
      resolutions.push({
        dependencyId,
        status: "blocked",
        required,
        detail: `dependency requires scopes not granted by this invocation: ${deniedScopes.join(", ")}`,
      });
      continue;
    }
    if (isRuntimeExecutorDependency(dependencyId)) {
      if (probeAvailable(probes, dependencyId) || !providerUnavailableDependencies.includes(dependencyId)) {
        resolutions.push({ dependencyId, status: "available", required });
        continue;
      }
      if (required) missingDependencies.push(dependencyId);
      resolutions.push({ dependencyId, status: "providerUnavailable", required });
      continue;
    }
    const providedProbe = findAvailableProbe(probes, dependencyId);
    if (providedProbe !== undefined) {
      const mismatchReason = versionMismatchReason(dependency, providedProbe.version);
      if (mismatchReason !== undefined) {
        if (required) missingDependencies.push(dependencyId);
        resolutions.push({ dependencyId, status: "blocked", required, observedVersion: providedProbe.version, detail: mismatchReason });
        continue;
      }
      resolutions.push({ dependencyId, status: "available", required, observedVersion: providedProbe.version });
      continue;
    }
    const probe = await probeDependency({
      dependencyId,
      context: toDependencyPlaneContext(request.context),
    });
    const normalizedProbe = toProbe(probe);
    probes.push(normalizedProbe);
    if (probe.available) {
      const mismatchReason = versionMismatchReason(dependency, probe.version);
      if (mismatchReason !== undefined) {
        if (required) missingDependencies.push(dependencyId);
        resolutions.push({ dependencyId, status: "blocked", required, observedVersion: probe.version, resolvedPath: probe.resolvedPath, detail: mismatchReason });
        continue;
      }
      if (allowInstall) {
        installResults.push({
          ok: true,
          dependencyId,
          availability: {
            dependencyId,
            status: "available",
            available: true,
            version: probe.version,
            resolvedPath: probe.resolvedPath,
          },
          events: ["runtime.dependency.probe.completed", "runtime.dependency.available"],
        });
      }
      resolutions.push({ dependencyId, status: "available", required, observedVersion: probe.version, resolvedPath: probe.resolvedPath });
      continue;
    }
    const source = lookupDependencySource(dependencyId);
    const installable = source.ok && source.value.safety === "trusted-managed" && source.value.managedInstall !== undefined;
    if (installable) {
      const installPolicy = dependency.install ?? "auto";
      if (installPolicy === "disabled") {
        if (required) missingDependencies.push(dependencyId);
        resolutions.push({
          dependencyId,
          status: "blocked",
          required,
          detail: "dependency install is disabled by declaration",
        });
        continue;
      }
      installableDependencies.push(dependencyId);
      if (installPolicy === "manual") {
        if (required) approvalRequiredDependencies.push(dependencyId);
        resolutions.push({
          dependencyId,
          status: "installable",
          required,
          detail: "dependency requires manual preparation before runtime use",
        });
        continue;
      }
      if (allowInstall && required) {
        const ensured = await ensureDependencyAvailable({
          dependencyId,
          context: toDependencyPlaneContext(request.context),
          allowInstall: true,
        });
        if (ensured.ok) {
          installResults.push({
            ok: true,
            dependencyId,
            availability: {
              dependencyId,
              status: toRuntimeStatus(ensured.value.status),
              available: ensured.value.available,
              version: ensured.value.version,
              resolvedPath: ensured.value.resolvedPath,
              installedNow: ensured.value.installedNow,
            },
            events: ensured.events,
          });
          resolutions.push({ dependencyId, status: toRuntimeStatus(ensured.value.status), required, observedVersion: ensured.value.version, resolvedPath: ensured.value.resolvedPath });
          continue;
        }
        installResults.push({
          ok: false,
          dependencyId,
          availability: { dependencyId, status: "blocked", available: false },
          events: ensured.events,
          error: { code: ensured.error.code, message: ensured.error.message, publicSafe: true },
        });
        missingDependencies.push(dependencyId);
        resolutions.push({ dependencyId, status: "blocked", required, detail: ensured.error.message });
        continue;
      }
      if (required) {
        requiredInstallableDependencies.push(dependencyId);
        approvalRequiredDependencies.push(dependencyId);
      }
      resolutions.push({ dependencyId, status: "installable", required, detail: probe.message });
      continue;
    }
    if (required) missingDependencies.push(dependencyId);
    resolutions.push({
      dependencyId,
      status: source.ok ? toRuntimeStatus(probe.status ?? "missing") : "unknown",
      required,
      detail: probe.message,
    });
  }

  const decision: BaseToolDependencyRuntimeDecision =
    readiness.decision === "blocked" || providerUnavailableDependencies.length > 0 || missingDependencies.length > 0
      ? "blocked"
      : readiness.decision === "requiresApproval" || approvalRequiredDependencies.length > 0
        ? "requiresApproval"
        : "ready";
  const status: BaseToolDependencyRuntimeStatus =
    decision === "blocked" && providerUnavailableDependencies.length > 0
      ? "providerUnavailable"
      : decision === "blocked" && resolutions.some((resolution) => resolution.status === "unknown")
        ? "unknown"
        : decision === "blocked" && resolutions.some((resolution) => resolution.status === "blocked")
          ? "blocked"
        : decision === "blocked"
          ? "missing"
      : decision === "requiresApproval"
        ? installableDependencies.length > 0
          ? "installable"
          : "requiresApproval"
        : missingDependencies.length > 0
          ? "missing"
          : "available";

  const report = makeReport({
    toolId,
    dependencies,
    probes,
    resolutions,
    missingDependencies,
    approvalRequiredDependencies,
    providerUnavailableDependencies,
  });
  const approvalDependencyIds = new Set(approvalRequiredDependencies);
  const iterationPlan: ToolDependencyIterationPlan = {
    refreshSteps: [
      ...approvalRequiredDependencies.map((dependencyId) => ({ dependencyId, action: "approve" as const, reason: "runtime support requires approval" })),
      ...providerUnavailableDependencies.map((dependencyId) => ({ dependencyId, action: "probe" as const, reason: "runtime support is unavailable" })),
      ...missingDependencies.map((dependencyId) => ({ dependencyId, action: "probe" as const, reason: "declared dependency has no available probe" })),
      ...requiredInstallableDependencies
        .filter((dependencyId) => !approvalDependencyIds.has(dependencyId))
        .map((dependencyId) => ({ dependencyId, action: "install" as const, reason: "required dependency has a trusted managed install recipe" })),
    ],
    requiresApproval: approvalRequiredDependencies.length > 0,
    events: ["runtime.baseTool.dependencies.iterationPlanned"],
  };

  return {
    kind: "runtime.execEngine.baseToolDependencyRuntime.result",
    toolId,
    decision,
    status,
    report,
    iterationPlan,
    installResults,
    missingDependencies,
    installableDependencies,
    approvalRequiredDependencies,
    providerUnavailableDependencies,
    events: [`runtime.baseTool.dependencies.${decision}`, `runtime.execEngine.baseToolDependencyRuntime.${decision}`],
    reason: dependencyFailureReason({ toolId, missingDependencies, installResults }) ?? readiness.reason,
    publicSafe: true,
  };
}
