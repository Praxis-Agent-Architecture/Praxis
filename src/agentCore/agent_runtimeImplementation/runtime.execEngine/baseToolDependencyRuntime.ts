/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / BaseTool 依赖运行时。
 * 核心目的：把 BaseToolDefinition.dependencies 接进 runtime 调用前置链路，统一做依赖报告、刷新计划、审批和可信 managed 安装。
 * 边界：不替代 storage baseTool 语义，不绕过 registry/handler/executor，不做 system-global 静默安装。
 */

import path from "node:path";
import { spawn } from "node:child_process";

import type { BaseToolDependencyDeclaration } from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  declarationsFromLspProfile,
  resolveLspDependency,
} from "../../agent_executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.js";
import {
  manageToolDependencies,
  type ToolDependencyDeclaration,
  type ToolDependencyProbe,
  type ToolDependencyReport,
} from "../../agent_executionEngine/basic_toolLayer/toolDependency/dependencyManager.js";
import {
  planToolDependencyIteration,
  type ToolDependencyIterationPlan,
  type ToolDependencyRefreshStep,
} from "../../agent_executionEngine/basic_toolLayer/toolDependency/dependencyIterationManager.js";
import {
  ensureDependencyAvailable,
  type EnsureDependencyAvailableResult,
} from "../../agent_executionEngine/basic_toolLayer/toolDependency/dependencyInstaller.js";
import {
  lookupDependencySource,
  managedBinDir,
  planDependencyInstallation,
  type ToolDependencyProbeCommand,
  type ToolDependencySourceEntry,
} from "../../agent_executionEngine/basic_toolLayer/toolDependency/dependencySourceRegistry.js";
import { readManagedDependencyRecord } from "../../agent_executionEngine/basic_toolLayer/toolDependency/dependencyManagedState.js";
import {
  createBaseToolSupportCatalog,
  type BaseToolRuntimeReadinessPreflight,
  type BaseToolSupportCatalogEntry,
  type BaseToolSupportCatalogOptions,
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function managedRootFrom(context: Pick<BaseToolDependencyRuntimeContext, "managedRoot" | "env" | "homeDir">): string {
  return path.dirname(managedBinDir({
    managedRoot: context.managedRoot,
    env: context.env,
    homeDir: context.homeDir,
  }));
}

function mapDependencyKind(kind: BaseToolDependencyDeclaration["kind"]): ToolDependencyDeclaration["kind"] {
  if (kind === "binary") return "binary";
  if (kind === "package") return "package";
  if (kind === "service") return "service";
  if (kind === "permission") return "permission";
  if (kind === "filesystem" || kind === "device" || kind === "network" || kind === "runtime") return "runtime";
  return "custom";
}

function mapDeclaration(dependency: BaseToolDependencyDeclaration): ToolDependencyDeclaration {
  return {
    dependencyId: dependency.dependencyId,
    kind: mapDependencyKind(dependency.kind),
    required: dependency.required,
    displayName: dependency.dependencyId,
    requiredScopes: dependency.kind === "permission" ? [dependency.dependencyId] : [],
    metadata: {
      baseToolDependencyKind: dependency.kind,
      description: dependency.description,
    },
  };
}

function lspTargetFrom(input: unknown): { filePath?: string; languageId?: string } | undefined {
  if (!isRecord(input)) return undefined;
  const target = isRecord(input.target) ? input.target : undefined;
  const context = isRecord(input.context) ? input.context : undefined;
  const filePath =
    readString(target?.filePath) ??
    readString(input.filePath) ??
    readString(input.targetFilePath);
  const languageId =
    readString(target?.languageId) ??
    readString(input.languageId) ??
    readString(context?.languageId);
  if (filePath === undefined && languageId === undefined) return undefined;
  return { filePath, languageId };
}

function workspaceRootFrom(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  const context = isRecord(input.context) ? input.context : undefined;
  return readString(context?.workspaceRoot) ?? readString(input.workspaceRoot);
}

function declarationsForRequest(
  entry: BaseToolSupportCatalogEntry,
  input: unknown,
): { declarations: readonly ToolDependencyDeclaration[]; events: readonly string[] } {
  const declarations = entry.dependencies
    .filter((dependency) => dependency.dependencyId !== "lsp.server.forTargetLanguage")
    .map(mapDeclaration);

  if (!entry.toolId.startsWith("code.lsp_")) {
    return { declarations, events: [] };
  }

  const lspTarget = lspTargetFrom(input);
  const resolved = resolveLspDependency({
    toolId: entry.toolId,
    target: lspTarget,
    workspaceRoot: workspaceRootFrom(input),
  });
  if (!resolved.ok) {
    return {
      declarations,
      events: resolved.events,
    };
  }

  return {
    declarations: [
      ...declarations,
      ...declarationsFromLspProfile(resolved.profile),
    ],
    events: resolved.events,
  };
}

function requiredMissingExecutorDependencies(entry: BaseToolSupportCatalogEntry): readonly string[] {
  return [
    ...new Set(entry.requiredSupports
      .filter((support) => (
        support.required &&
        support.supportKind === "executor-port" &&
        (support.status === "notImplemented" || support.status === "unavailable" || support.status === "disabled")
      ))
      .map((support) => support.dependencyId)),
  ].sort();
}

function permissionDependenciesRequiringApproval(
  entry: BaseToolSupportCatalogEntry,
  governanceAccepted: boolean,
): readonly string[] {
  if (governanceAccepted) return [];
  return [
    ...new Set(entry.requiredSupports
      .filter((support) => support.required && support.supportKind === "permission" && support.status === "requiresApproval")
      .map((support) => support.dependencyId)),
  ].sort();
}

function permissionDependencies(entry: BaseToolSupportCatalogEntry): readonly string[] {
  return [
    ...new Set(entry.requiredSupports
      .filter((support) => support.supportKind === "permission")
      .map((support) => support.dependencyId)),
  ].sort();
}

function catalogSupportSatisfiesDependency(input: {
  entry: BaseToolSupportCatalogEntry;
  dependencyId: string;
  approvalRequiredDependencies: readonly string[];
}): boolean {
  const supports = input.entry.requiredSupports.filter((support) => support.dependencyId === input.dependencyId);
  if (supports.length === 0) return false;
  return supports
    .filter((support) => support.required)
    .every((support) => {
      if (support.status === "available") return true;
      if (support.supportKind === "permission" && !input.approvalRequiredDependencies.includes(support.dependencyId)) {
        return true;
      }
      return false;
    });
}

async function runDependencyProbeCommand(
  command: ToolDependencyProbeCommand,
  context: BaseToolDependencyRuntimeContext,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command.command, [...(command.args ?? [])], {
      env: {
        ...process.env,
        ...(context.env ?? {}),
      },
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, context.timeoutMs ?? 10_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`dependency probe timed out: ${command.command}`));
        return;
      }
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function probeDetectOnlyDependency(input: {
  dependencyId: string;
  source: ToolDependencySourceEntry;
  context: BaseToolDependencyRuntimeContext;
}): Promise<ToolDependencyProbe | undefined> {
  if (input.source.safety !== "trusted-detect-only") return undefined;
  const probeCommand = input.source.versionCommand ?? {
    command: input.source.executableName,
    args: ["--version"],
  };
  if (probeCommand.command.trim().length === 0) return undefined;

  try {
    const result = await runDependencyProbeCommand(probeCommand, input.context);
    const available = result.exitCode === 0;
    const detail = result.stdout.split(/\r?\n/u)[0]?.trim() || result.stderr.split(/\r?\n/u)[0]?.trim() || undefined;
    return {
      dependencyId: input.dependencyId,
      available,
      version: available ? detail : undefined,
      resolvedPath: probeCommand.command,
      observedAt: new Date().toISOString(),
      detail: detail ?? (available ? "detect-only dependency probe succeeded" : "detect-only dependency probe failed"),
      metadata: {
        dependencySource: input.source.sourceId,
        probeKind: "detect-only-live",
      },
    };
  } catch (error) {
    return {
      dependencyId: input.dependencyId,
      available: false,
      detail: error instanceof Error ? error.message : "detect-only dependency probe failed",
      metadata: {
        dependencySource: input.source.sourceId,
        probeKind: "detect-only-live",
      },
    };
  }
}

async function probesForDeclarations(input: {
  declarations: readonly ToolDependencyDeclaration[];
  entry: BaseToolSupportCatalogEntry;
  context: BaseToolDependencyRuntimeContext;
  providedProbes: readonly ToolDependencyProbe[];
  missingExecutorDependencies: readonly string[];
  approvalRequiredDependencies: readonly string[];
}): Promise<readonly ToolDependencyProbe[]> {
  const managedRoot = managedRootFrom(input.context);
  const provided = new Map(input.providedProbes.map((probe) => [probe.dependencyId?.trim(), probe]));
  const probes: ToolDependencyProbe[] = [];

  for (const declaration of input.declarations) {
    const dependencyId = declaration.dependencyId?.trim();
    if (dependencyId === undefined || dependencyId.length === 0) continue;

    const existing = provided.get(dependencyId);
    if (existing !== undefined) {
      probes.push(existing);
      continue;
    }

    if (input.missingExecutorDependencies.includes(dependencyId)) {
      probes.push({
        dependencyId,
        available: false,
        blocked: true,
        detail: "required runtime executor port is unavailable",
      });
      continue;
    }

    if (input.approvalRequiredDependencies.includes(dependencyId)) {
      probes.push({
        dependencyId,
        available: false,
        blocked: true,
        detail: "dependency requires runtime approval",
      });
      continue;
    }

    if (catalogSupportSatisfiesDependency({
      entry: input.entry,
      dependencyId,
      approvalRequiredDependencies: input.approvalRequiredDependencies,
    })) {
      probes.push({
        dependencyId,
        available: true,
        detail: "runtime support catalog reports this dependency is available",
      });
      continue;
    }

    const source = lookupDependencySource(dependencyId);
    if (source.ok) {
      const detected = await probeDetectOnlyDependency({
        dependencyId,
        source: source.source,
        context: input.context,
      });
      if (detected !== undefined) {
        probes.push(detected);
        continue;
      }

      const record = await readManagedDependencyRecord(managedRoot, dependencyId);
      probes.push({
        dependencyId,
        available: record?.status === "available" || record?.status === "installed",
        version: record?.version,
        resolvedPath: record?.resolvedPath,
        observedAt: record?.observedAt,
        detail: record === undefined ? "no managed dependency record found" : record.lastError,
        metadata: {
          dependencySource: source.source.sourceId,
          managedRoot,
        },
      });
      continue;
    }

    probes.push({
      dependencyId,
      detail: "runtime contract dependency is not registered and cannot be assumed available",
    });
  }

  return probes;
}

function installableSteps(plan: ToolDependencyIterationPlan | undefined): readonly ToolDependencyRefreshStep[] {
  return (plan?.refreshSteps ?? []).filter((step) => step.installPlan !== undefined && !step.installPlan.approvalRequired);
}

function shouldInstallTrustedManaged(mode: BaseToolDependencyRuntimeMode | undefined): boolean {
  return mode === "autoInstallTrustedManaged" || mode === "auto" || mode === "full";
}

async function installTrustedManagedSteps(input: {
  steps: readonly ToolDependencyRefreshStep[];
  context: BaseToolDependencyRuntimeContext;
}): Promise<readonly EnsureDependencyAvailableResult[]> {
  const results: EnsureDependencyAvailableResult[] = [];
  for (const step of input.steps) {
    const result = await ensureDependencyAvailable({
      dependencyId: step.dependencyId,
      managedRoot: input.context.managedRoot,
      env: input.context.env,
      homeDir: input.context.homeDir,
      timeoutMs: input.context.timeoutMs,
    });
    results.push(result);
  }
  return results;
}

function makeResult(input: Omit<BaseToolDependencyRuntimeResult, "kind" | "publicSafe">): BaseToolDependencyRuntimeResult {
  return {
    kind: "runtime.execEngine.baseToolDependencyRuntime.result",
    publicSafe: true,
    ...input,
  };
}

export async function preflightBaseToolDependencies(
  request: BaseToolDependencyRuntimeRequest,
): Promise<BaseToolDependencyRuntimeResult> {
  const toolId = request.context.toolId.trim();
  const entry = request.catalogEntry ?? request.readiness?.entry ?? createBaseToolSupportCatalog(request).find((candidate) => candidate.toolId === toolId);
  if (entry === undefined) {
    return makeResult({
      toolId,
      decision: "blocked",
      status: "blocked",
      installResults: [],
      missingDependencies: [],
      installableDependencies: [],
      approvalRequiredDependencies: [],
      providerUnavailableDependencies: [],
      events: ["runtime.execEngine.baseToolDependencyRuntime.missingTool"],
      reason: `BaseTool ${toolId} is not present in the dependency runtime catalog`,
    });
  }

  const declarationResult = declarationsForRequest(entry, request.context.toolInput);
  const missingExecutorDependencies = requiredMissingExecutorDependencies(entry);
  const allPermissionDependencies = permissionDependencies(entry);
  const approvalRequiredDependencies = permissionDependenciesRequiringApproval(entry, request.context.governanceAccepted === true);
  const probes = await probesForDeclarations({
    declarations: declarationResult.declarations,
    entry,
    context: request.context,
    providedProbes: request.probes ?? [],
    missingExecutorDependencies,
    approvalRequiredDependencies,
  });

  const managed = manageToolDependencies({
    toolId,
    declarations: declarationResult.declarations,
    probes,
    context: {
      runtimeId: request.context.runtimeId,
      invocationId: request.context.invocationId,
      dryRun: true,
      allowedScopes: [...new Set([...(request.context.allowedScopes ?? []), ...approvalRequiredDependencies, ...allPermissionDependencies])],
      auditMetadata: {
        sessionId: request.context.sessionId,
      },
    },
  });
  if (!managed.ok) {
    return makeResult({
      toolId,
      decision: "blocked",
      status: "blocked",
      installResults: [],
      missingDependencies: [],
      installableDependencies: [],
      approvalRequiredDependencies,
      providerUnavailableDependencies: missingExecutorDependencies,
      events: ["runtime.execEngine.baseToolDependencyRuntime.rejected", ...declarationResult.events, ...managed.events],
      reason: managed.error.message,
    });
  }

  const iteration = planToolDependencyIteration({
    toolId,
    report: managed.report,
    strategy: {
      refreshMissing: true,
      refreshStale: true,
      includeOptional: false,
      managedRoot: request.context.managedRoot,
      env: request.context.env,
      homeDir: request.context.homeDir,
      installTarget: "praxis-managed",
    },
    context: {
      runtimeId: request.context.runtimeId,
      invocationId: request.context.invocationId,
      dryRun: true,
      auditMetadata: {
        sessionId: request.context.sessionId,
      },
    },
  });
  if (!iteration.ok) {
    return makeResult({
      toolId,
      decision: "blocked",
      status: "blocked",
      report: managed.report,
      installResults: [],
      missingDependencies: managed.report.resolutions.filter((resolution) => resolution.status !== "satisfied").map((resolution) => resolution.dependencyId),
      installableDependencies: [],
      approvalRequiredDependencies,
      providerUnavailableDependencies: missingExecutorDependencies,
      events: ["runtime.execEngine.baseToolDependencyRuntime.iterationRejected", ...declarationResult.events, ...managed.events, ...iteration.events],
      reason: iteration.error.message,
    });
  }

  const installable = installableSteps(iteration.plan);
  const installResults =
    shouldInstallTrustedManaged(request.context.mode) && missingExecutorDependencies.length === 0
      ? await installTrustedManagedSteps({ steps: installable, context: request.context })
      : [];
  const failedInstall = installResults.find((result) => !result.ok);
  if (failedInstall !== undefined) {
    return makeResult({
      toolId,
      decision: failedInstall.error.code === "DEPENDENCY_INSTALL_APPROVAL_REQUIRED" ? "requiresApproval" : "blocked",
      status: failedInstall.error.code === "DEPENDENCY_INSTALL_APPROVAL_REQUIRED" ? "requiresApproval" : "blocked",
      report: managed.report,
      iterationPlan: iteration.plan,
      installResults,
      missingDependencies: managed.report.resolutions.filter((resolution) => resolution.status !== "satisfied").map((resolution) => resolution.dependencyId),
      installableDependencies: installable.map((step) => step.dependencyId),
      approvalRequiredDependencies: [
        ...approvalRequiredDependencies,
        ...iteration.plan.refreshSteps.filter((step) => step.approvalRequired).map((step) => step.dependencyId),
      ],
      providerUnavailableDependencies: missingExecutorDependencies,
      events: ["runtime.execEngine.baseToolDependencyRuntime.installFailed", ...declarationResult.events, ...managed.events, ...iteration.events, ...failedInstall.events],
      reason: failedInstall.error.message,
    });
  }

  if (missingExecutorDependencies.length > 0) {
    return makeResult({
      toolId,
      decision: "blocked",
      status: "providerUnavailable",
      report: managed.report,
      iterationPlan: iteration.plan,
      installResults,
      missingDependencies: managed.report.resolutions.filter((resolution) => resolution.status !== "satisfied").map((resolution) => resolution.dependencyId),
      installableDependencies: installable.map((step) => step.dependencyId),
      approvalRequiredDependencies,
      providerUnavailableDependencies: missingExecutorDependencies,
      events: ["runtime.execEngine.baseToolDependencyRuntime.providerUnavailable", ...declarationResult.events, ...managed.events, ...iteration.events],
      reason: `BaseTool ${toolId} is missing runtime executor dependencies: ${missingExecutorDependencies.join(", ")}`,
    });
  }

  const installApprovalDependencies = iteration.plan.refreshSteps
    .filter((step) => step.installPlan?.approvalRequired === true)
    .map((step) => step.dependencyId);
  if (approvalRequiredDependencies.length > 0 || installApprovalDependencies.length > 0) {
    return makeResult({
      toolId,
      decision: "requiresApproval",
      status: "requiresApproval",
      report: managed.report,
      iterationPlan: iteration.plan,
      installResults,
      missingDependencies: managed.report.resolutions.filter((resolution) => resolution.status !== "satisfied").map((resolution) => resolution.dependencyId),
      installableDependencies: installable.map((step) => step.dependencyId),
      approvalRequiredDependencies: [...new Set([...approvalRequiredDependencies, ...installApprovalDependencies])].sort(),
      providerUnavailableDependencies: [],
      events: ["runtime.execEngine.baseToolDependencyRuntime.requiresApproval", ...declarationResult.events, ...managed.events, ...iteration.events],
      reason: `BaseTool ${toolId} has dependencies that require approval`,
    });
  }

  if (installable.length > 0 && installResults.length === 0) {
    return makeResult({
      toolId,
      decision: "requiresApproval",
      status: "installable",
      report: managed.report,
      iterationPlan: iteration.plan,
      installResults,
      missingDependencies: managed.report.resolutions.filter((resolution) => resolution.status !== "satisfied").map((resolution) => resolution.dependencyId),
      installableDependencies: installable.map((step) => step.dependencyId),
      approvalRequiredDependencies: installable.map((step) => step.dependencyId),
      providerUnavailableDependencies: [],
      events: ["runtime.execEngine.baseToolDependencyRuntime.installable", ...declarationResult.events, ...managed.events, ...iteration.events],
      reason: `BaseTool ${toolId} can prepare managed dependencies after approval`,
    });
  }

  const installedDependencyIds = new Set(installResults
    .filter((result) => result.ok)
    .map((result) => result.availability.dependencyId));
  const unsatisfied = managed.report.resolutions
    .filter((resolution) => resolution.required && resolution.status !== "satisfied")
    .filter((resolution) => !installedDependencyIds.has(resolution.dependencyId))
    .map((resolution) => resolution.dependencyId);
  const installedNow = installResults.some((result) => result.ok && result.availability.installedNow);
  if (unsatisfied.length > 0) {
    return makeResult({
      toolId,
      decision: "blocked",
      status: managed.report.summary.unknown > 0 ? "unknown" : "missing",
      report: managed.report,
      iterationPlan: iteration.plan,
      installResults,
      missingDependencies: unsatisfied,
      installableDependencies: installable.map((step) => step.dependencyId),
      approvalRequiredDependencies: [],
      providerUnavailableDependencies: [],
      events: ["runtime.execEngine.baseToolDependencyRuntime.unsatisfied", ...declarationResult.events, ...managed.events, ...iteration.events, ...installResults.flatMap((result) => result.events)],
      reason: `BaseTool ${toolId} has unsatisfied dependencies: ${unsatisfied.join(", ")}`,
    });
  }
  return makeResult({
    toolId,
    decision: "ready",
    status: installedNow ? "installed" : "available",
    report: managed.report,
    iterationPlan: iteration.plan,
    installResults,
    missingDependencies: unsatisfied,
    installableDependencies: installable.map((step) => step.dependencyId),
    approvalRequiredDependencies: [],
    providerUnavailableDependencies: [],
    events: ["runtime.execEngine.baseToolDependencyRuntime.ready", ...declarationResult.events, ...managed.events, ...iteration.events, ...installResults.flatMap((result) => result.events)],
    reason: installedNow ? `BaseTool ${toolId} dependencies were installed and are ready` : `BaseTool ${toolId} dependencies are ready`,
  });
}

export const baseToolDependencyRuntimeDescriptor = {
  surface: "runtime.execEngine.baseToolDependencyRuntime",
  declarationSource: "BaseToolDefinition.dependencies",
  usesDependencyManager: true,
  usesDependencyIterationManager: true,
  trustedManagedAutoInstallIsExplicit: true,
  systemGlobalInstallIsNeverSilent: true,
  canonicalToolChainUnaffected: true,
} as const;
