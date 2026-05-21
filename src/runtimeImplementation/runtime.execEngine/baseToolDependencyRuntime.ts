import type {
  BaseToolRuntimeReadinessPreflight,
  BaseToolSupportCatalogEntry,
  BaseToolSupportCatalogOptions,
} from "./baseToolSupportCatalog.js";
import {
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
} from "./baseToolSupportCatalog.js";

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
  message?: string;
  metadata?: Readonly<Record<string, unknown>>;
  [key: string]: unknown;
};

export type ToolDependencyReport = {
  toolId: string;
  dependencies: readonly string[];
  probes: readonly ToolDependencyProbe[];
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
  availability: BaseToolDependencyRuntimeStatus;
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
  return probes.some((probe) => probe.dependencyId === dependencyId && (probe.available === true || probe.status === "available"));
}

function makeReport(input: {
  toolId: string;
  entry?: BaseToolSupportCatalogEntry;
  probes: readonly ToolDependencyProbe[];
  missingDependencies: readonly string[];
  approvalRequiredDependencies: readonly string[];
  providerUnavailableDependencies: readonly string[];
}): ToolDependencyReport {
  return {
    toolId: input.toolId,
    dependencies: input.entry?.dependencies.map((dependency) => dependency.dependencyId) ?? [],
    probes: input.probes,
    missingDependencies: input.missingDependencies,
    approvalRequiredDependencies: input.approvalRequiredDependencies,
    providerUnavailableDependencies: input.providerUnavailableDependencies,
    events: ["runtime.baseTool.dependencies.reported"],
  };
}

export async function preflightBaseToolDependencies(
  request: BaseToolDependencyRuntimeRequest,
): Promise<BaseToolDependencyRuntimeResult> {
  const toolId = request.context.toolId.trim();
  const readiness = request.readiness ?? evaluateBaseToolRuntimeReadiness({ ...request, toolId });
  const entry = request.catalogEntry ?? readiness.entry ?? createBaseToolSupportCatalog(request).find((candidate) => candidate.toolId === toolId);
  const probes = request.probes ?? [];

  const missingDependencies = (entry?.dependencies ?? [])
    .filter((dependency) => dependency.required && !probeAvailable(probes, dependency.dependencyId))
    .map((dependency) => dependency.dependencyId);
  const approvalRequiredDependencies = readiness.approvalSupports.map((support) => support.dependencyId);
  const providerUnavailableDependencies = readiness.blockingSupports.map((support) => support.dependencyId);

  const decision: BaseToolDependencyRuntimeDecision =
    readiness.decision === "blocked" || providerUnavailableDependencies.length > 0
      ? "blocked"
      : readiness.decision === "requiresApproval" || approvalRequiredDependencies.length > 0
        ? "requiresApproval"
        : "ready";
  const status: BaseToolDependencyRuntimeStatus =
    decision === "blocked"
      ? "providerUnavailable"
      : decision === "requiresApproval"
        ? "requiresApproval"
        : missingDependencies.length > 0
          ? "missing"
          : "available";

  const report = makeReport({
    toolId,
    entry,
    probes,
    missingDependencies,
    approvalRequiredDependencies,
    providerUnavailableDependencies,
  });
  const iterationPlan: ToolDependencyIterationPlan = {
    refreshSteps: [
      ...approvalRequiredDependencies.map((dependencyId) => ({ dependencyId, action: "approve" as const, reason: "runtime support requires approval" })),
      ...providerUnavailableDependencies.map((dependencyId) => ({ dependencyId, action: "probe" as const, reason: "runtime support is unavailable" })),
      ...missingDependencies.map((dependencyId) => ({ dependencyId, action: "probe" as const, reason: "declared dependency has no available probe" })),
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
    installResults: [],
    missingDependencies,
    installableDependencies: [],
    approvalRequiredDependencies,
    providerUnavailableDependencies,
    events: [`runtime.baseTool.dependencies.${decision}`],
    reason: readiness.reason,
    publicSafe: true,
  };
}
