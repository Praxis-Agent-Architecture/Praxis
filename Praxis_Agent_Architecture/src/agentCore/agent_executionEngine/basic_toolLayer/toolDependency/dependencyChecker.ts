/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 工具依赖管理层。
 * 核心目的：承载 dependency Checker 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import path from "node:path";
import { lookupDependencySource, managedBinDir } from "./dependencySourceRegistry.js";

export type BasicToolDependencyKind =
  | "binary"
  | "permission"
  | "mcp-server"
  | "environment"
  | "runtime-capability"
  | "package";

export type BasicToolDependencyBoundary = "input" | "contract" | "dependency" | "scope";

export type BasicToolDependencySeverity = "required" | "optional";

export type BasicToolDependencyDeclaration = {
  id: string;
  kind: BasicToolDependencyKind;
  severity?: BasicToolDependencySeverity;
  versionRange?: string;
  scope?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BasicToolDependencyProbe = {
  id: string;
  available: boolean;
  version?: string;
  resolvedPath?: string;
  scope?: string;
  detail?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BasicToolDependencyContext = {
  runtimeId?: string;
  toolId?: string;
  dryRun?: boolean;
  allowedScopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type BasicToolDependencyCheckRequest = {
  context?: BasicToolDependencyContext;
  dependencies?: readonly BasicToolDependencyDeclaration[];
  probes?: readonly BasicToolDependencyProbe[];
  refreshPolicy?: "use-provided-probes" | "stale-ok";
};

export type BasicToolDependencyErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_TOOL_ID"
  | "MISSING_DEPENDENCIES"
  | "INVALID_DEPENDENCY"
  | "SCOPE_DENIED"
  | "DEPENDENCY_UNAVAILABLE"
  | "REFRESH_PROBE_BLOCKED";

export type BasicToolDependencyError = {
  code: BasicToolDependencyErrorCode;
  message: string;
  boundary: BasicToolDependencyBoundary;
  publicSafe: true;
};

export type BasicToolDependencyStatus = {
  id: string;
  kind: BasicToolDependencyKind;
  severity: BasicToolDependencySeverity;
  available: boolean;
  version?: string;
  resolvedPath?: string;
  versionRange?: string;
  scope?: string;
  staleProbeAccepted: boolean;
  detail?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type BasicToolDependencyProbeLocation = "praxis-managed" | "path";

export type BasicToolDependencyProbeCandidate = {
  id: string;
  command: string;
  args: readonly string[];
  location: BasicToolDependencyProbeLocation;
};

export type BasicToolDependencyProbePlan = {
  kind: "agentCore.basicTool.dependencyProbePlan";
  dependencyId: string;
  candidates: readonly BasicToolDependencyProbeCandidate[];
  externalProbePerformed: false;
  unsafeSideEffects: false;
};

export type BasicToolDependencyReport = {
  kind: "agentCore.basicTool.dependencyReport";
  runtimeId: string;
  toolId: string;
  status: "satisfied" | "degraded";
  dependencies: readonly BasicToolDependencyStatus[];
  missingRequired: readonly string[];
  optionalMissing: readonly string[];
  dryRun: true;
  externalProbePerformed: false;
  unsafeSideEffects: false;
  audit: {
    event: "agentCore.basicTool.dependencyChecker.checked";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type BasicToolDependencyCheckResult =
  | {
      ok: true;
      report: BasicToolDependencyReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BasicToolDependencyError;
      report?: BasicToolDependencyReport;
      events: readonly string[];
    };

export const basicToolDependencyCheckerDescriptor = {
  capability: "check-basic-tool-runtime-dependencies",
  layer: "agent_executionEngine.basic_toolLayer.toolDependency.dependencyChecker",
  defaultRefreshPolicy: "use-provided-probes",
  externalProbePerformed: false,
  unsafeSideEffects: false,
} as const;

export function planBasicToolDependencyProbe(
  dependency: BasicToolDependencyDeclaration,
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    homeDir?: string;
    managedRoot?: string;
  } = {},
): BasicToolDependencyProbePlan {
  const sourceLookup = lookupDependencySource(dependency.id);
  const source = sourceLookup.ok ? sourceLookup.source : undefined;
  const command = source?.executableName ?? dependency.id;
  const alternateCommands = source?.alternateExecutableNames ?? [];
  const binDir = managedBinDir(options);
  const commands = [command, ...alternateCommands];

  return {
    kind: "agentCore.basicTool.dependencyProbePlan",
    dependencyId: dependency.id,
    candidates: [
      ...commands.map((candidate) => ({
        id: `${dependency.id}:managed:${candidate}`,
        command: path.join(binDir, candidate),
        args: source?.versionCommand?.args ?? ["--version"],
        location: "praxis-managed" as const,
      })),
      ...commands.map((candidate) => ({
        id: `${dependency.id}:path:${candidate}`,
        command: candidate,
        args: source?.versionCommand?.args ?? ["--version"],
        location: "path" as const,
      })),
    ],
    externalProbePerformed: false,
    unsafeSideEffects: false,
  };
}

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: BasicToolDependencyErrorCode,
  message: string,
  boundary: BasicToolDependencyBoundary,
  report?: BasicToolDependencyReport,
): BasicToolDependencyCheckResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    report,
    events: ["agentCore.basicTool.dependencyChecker.rejected"],
  };
}

function validateDependency(
  dependency: BasicToolDependencyDeclaration,
): BasicToolDependencyDeclaration | BasicToolDependencyCheckResult {
  const id = dependency.id?.trim();
  if (isBlank(id)) {
    return failure("INVALID_DEPENDENCY", "basic tool dependency declarations require id", "input");
  }

  return {
    ...dependency,
    id: id ?? "",
    severity: dependency.severity ?? "required",
    scope: dependency.scope?.trim() || undefined,
  };
}

function findProbe(
  dependency: BasicToolDependencyDeclaration,
  probes: readonly BasicToolDependencyProbe[],
): BasicToolDependencyProbe | undefined {
  return probes.find((probe) => probe.id.trim() === dependency.id);
}

function ensureScope(
  dependency: BasicToolDependencyDeclaration,
  allowedScopes: readonly string[] | undefined,
): BasicToolDependencyCheckResult | undefined {
  const scope = dependency.scope?.trim();
  if (scope === undefined || scope.length === 0) {
    return undefined;
  }

  const allowed = cleanList(allowedScopes);
  if (allowed.length === 0 || allowed.includes(scope)) {
    return undefined;
  }

  return failure("SCOPE_DENIED", `basic tool dependency scope ${scope} is outside runtime governance`, "scope");
}

function buildReport(
  runtimeId: string,
  toolId: string,
  statuses: readonly BasicToolDependencyStatus[],
  metadata: Readonly<Record<string, unknown>>,
): BasicToolDependencyReport {
  const missingRequired = statuses
    .filter((status) => status.severity === "required" && !status.available)
    .map((status) => status.id);
  const optionalMissing = statuses
    .filter((status) => status.severity === "optional" && !status.available)
    .map((status) => status.id);

  return {
    kind: "agentCore.basicTool.dependencyReport",
    runtimeId,
    toolId,
    status: missingRequired.length === 0 ? "satisfied" : "degraded",
    dependencies: statuses,
    missingRequired,
    optionalMissing,
    dryRun: true,
    externalProbePerformed: false,
    unsafeSideEffects: false,
    audit: {
      event: "agentCore.basicTool.dependencyChecker.checked",
      metadata,
    },
  };
}

export function checkBasicToolDependencies(
  request: BasicToolDependencyCheckRequest = {},
): BasicToolDependencyCheckResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "basic tool dependency check requires context.runtimeId", "input");
  }

  const toolId = request.context?.toolId?.trim();
  if (isBlank(toolId)) {
    return failure("MISSING_TOOL_ID", "basic tool dependency check requires context.toolId", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REFRESH_PROBE_BLOCKED",
      "first-round dependencyChecker only evaluates provided dependency probes",
      "contract",
    );
  }

  if (request.dependencies === undefined || request.dependencies.length === 0) {
    return failure("MISSING_DEPENDENCIES", "basic tool dependency check requires at least one dependency", "input");
  }

  const probes = request.probes ?? [];
  const statuses: BasicToolDependencyStatus[] = [];

  for (const rawDependency of request.dependencies) {
    const dependency = validateDependency(rawDependency);
    if ("ok" in dependency) {
      return dependency;
    }

    const scopeError = ensureScope(dependency, request.context?.allowedScopes);
    if (scopeError !== undefined) {
      return scopeError;
    }

    const probe = findProbe(dependency, probes);
    const available = probe?.available ?? false;
    statuses.push({
      id: dependency.id,
      kind: dependency.kind,
      severity: dependency.severity ?? "required",
      available,
      version: probe?.version,
      resolvedPath: probe?.resolvedPath,
      versionRange: dependency.versionRange,
      scope: dependency.scope,
      staleProbeAccepted: request.refreshPolicy === "stale-ok",
      detail: probe?.detail,
      metadata: {
        ...(dependency.metadata ?? {}),
        ...(probe?.metadata ?? {}),
      },
    });
  }

  const report = buildReport(runtimeId ?? "", toolId ?? "", statuses, request.context?.metadata ?? {});
  if (report.missingRequired.length > 0) {
    return failure(
      "DEPENDENCY_UNAVAILABLE",
      `basic tool dependency check failed for ${report.missingRequired[0]}`,
      "dependency",
      report,
    );
  }

  return {
    ok: true,
    report,
    events: ["agentCore.basicTool.dependencyChecker.checked"],
  };
}
