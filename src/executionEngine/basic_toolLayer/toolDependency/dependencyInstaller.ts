import { spawn } from "node:child_process";
import { access, chmod, mkdir } from "node:fs/promises";
import path from "node:path";

import { updateManagedDependencyRecord } from "./dependencyManagedState.js";
import { planBasicToolDependencyProbe } from "./dependencyChecker.js";
import {
  lookupDependencySource,
  managedBinDir,
  planDependencyInstallation,
  type ToolDependencyInstallPlan,
  type ToolDependencyInstallStep,
  type ToolDependencySourceEntry,
} from "./dependencySourceRegistry.js";

export type DependencyCommandExecution = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type EnsureDependencyAvailableRequest = {
  dependencyId: string;
  source?: ToolDependencySourceEntry;
  managedRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
  timeoutMs?: number;
};

export type EnsuredDependencyAvailability = {
  dependencyId: string;
  sourceId: string;
  managedRoot: string;
  binDir: string;
  resolvedPath: string;
  version?: string;
  installedNow: boolean;
  audit: {
    event: "agentCore.basicToolLayer.toolDependency.installer.ensured";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type EnsureDependencyAvailableResult =
  | {
      ok: true;
      availability: EnsuredDependencyAvailability;
      events: readonly string[];
    }
  | {
      ok: false;
      error: {
        code:
          | "DEPENDENCY_SOURCE_NOT_FOUND"
          | "DEPENDENCY_INSTALL_APPROVAL_REQUIRED"
          | "DEPENDENCY_INSTALL_FAILED"
          | "DEPENDENCY_PROBE_FAILED";
        message: string;
        publicSafe: true;
      };
      plan?: ToolDependencyInstallPlan;
      events: readonly string[];
    };

export const dependencyInstallerDescriptor = {
  layer: "agent_executionEngine.basic_toolLayer.toolDependency",
  capability: "dependency-installation",
  installsToManagedRootOnly: true,
  autoInstallsTrustedManagedSources: true,
} as const;

type EnsureDependencyAvailableErrorCode =
  | "DEPENDENCY_SOURCE_NOT_FOUND"
  | "DEPENDENCY_INSTALL_APPROVAL_REQUIRED"
  | "DEPENDENCY_INSTALL_FAILED"
  | "DEPENDENCY_PROBE_FAILED";

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: EnsureDependencyAvailableErrorCode,
  message: string,
  plan?: ToolDependencyInstallPlan,
): EnsureDependencyAvailableResult {
  return {
    ok: false,
    error: {
      code,
      message,
      publicSafe: true,
    },
    plan,
    events: ["agentCore.basicToolLayer.toolDependency.installer.rejected"],
  };
}

async function runCommand(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: Readonly<Record<string, string | undefined>>;
    timeoutMs?: number;
  } = {},
): Promise<DependencyCommandExecution> {
  return await new Promise<DependencyCommandExecution>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (timer !== undefined) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (timer !== undefined) clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`dependency command timed out: ${command}`));
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

async function executeInstallStep(
  step: ToolDependencyInstallStep,
  request: EnsureDependencyAvailableRequest,
): Promise<DependencyCommandExecution> {
  for (const destination of step.writesTo) {
    await mkdir(destination, { recursive: true });
  }

  return await runCommand(step.command, step.args, {
    cwd: step.cwd,
    env: {
      ...(request.env ?? {}),
      ...(step.env ?? {}),
    },
    timeoutMs: request.timeoutMs ?? 120_000,
  });
}

async function probeDependency(
  request: EnsureDependencyAvailableRequest,
  managedRoot: string,
  source: ToolDependencySourceEntry,
): Promise<{ resolvedPath: string; version?: string } | undefined> {
  const binDir = managedBinDir({ ...request, managedRoot });
  const managedExecutableDirs = source.packageManager === "npm"
    ? [path.join(managedRoot, "node_modules", ".bin"), binDir]
    : [binDir];
  const probePlan = source.executableName.trim().length > 0
    ? {
        candidates: [
          ...managedExecutableDirs.map((directory) => ({
            command: path.join(directory, source.executableName),
            args: source.versionCommand?.args ?? ["--version"],
          })),
          {
            command: source.executableName,
            args: source.versionCommand?.args ?? ["--version"],
          },
          ...(source.alternateExecutableNames ?? []).flatMap((name) => [
            ...managedExecutableDirs.map((directory) => ({
              command: path.join(directory, name),
              args: source.versionCommand?.args ?? ["--version"],
            })),
            {
              command: name,
              args: source.versionCommand?.args ?? ["--version"],
            },
          ]),
        ],
      }
    : planBasicToolDependencyProbe(
        {
          id: request.dependencyId,
          kind: "runtime-capability",
        },
        {
          env: request.env,
          homeDir: request.homeDir,
          managedRoot,
        },
      );

  for (const candidate of probePlan.candidates) {
    try {
      const result = await runCommand(candidate.command, candidate.args, {
        env: request.env,
        timeoutMs: request.timeoutMs ?? 10_000,
      });
      if (result.exitCode === 0) {
        return {
          resolvedPath: candidate.command,
          version: result.stdout.split(/\r?\n/u)[0]?.trim() || undefined,
        };
      }
    } catch {
      // keep trying the next candidate
    }
  }

  return undefined;
}

export async function ensureDependencyAvailable(
  request: EnsureDependencyAvailableRequest,
): Promise<EnsureDependencyAvailableResult> {
  const sourceLookup = request.source !== undefined ? { ok: true as const, source: request.source } : lookupDependencySource(request.dependencyId);
  if (!sourceLookup.ok) {
    return failure("DEPENDENCY_SOURCE_NOT_FOUND", sourceLookup.error.message);
  }

  const managedRoot = request.managedRoot?.trim() || path.dirname(managedBinDir(request));
  const binDir = managedBinDir({ ...request, managedRoot });

  const existing = await probeDependency(request, managedRoot, sourceLookup.source);
  if (existing !== undefined) {
    await updateManagedDependencyRecord(managedRoot, {
      dependencyId: request.dependencyId,
      sourceId: sourceLookup.source.sourceId,
      status: "available",
      managedRoot,
      resolvedPath: existing.resolvedPath,
      version: existing.version,
      observedAt: new Date().toISOString(),
      metadata: {
        installedNow: false,
      },
    });

    return {
      ok: true,
      availability: {
        dependencyId: request.dependencyId,
        sourceId: sourceLookup.source.sourceId,
        managedRoot,
        binDir,
        resolvedPath: existing.resolvedPath,
        version: existing.version,
        installedNow: false,
        audit: {
          event: "agentCore.basicToolLayer.toolDependency.installer.ensured",
          metadata: {
            dependencyId: request.dependencyId,
            sourceId: sourceLookup.source.sourceId,
            installedNow: false,
          },
        },
      },
      events: ["agentCore.basicToolLayer.toolDependency.installer.available"],
    };
  }

  const planResult = planDependencyInstallation({
    dependencyId: request.dependencyId,
    managedRoot,
    env: request.env,
    homeDir: request.homeDir,
    source: sourceLookup.source,
  });

  if (!planResult.ok) {
    return failure("DEPENDENCY_INSTALL_FAILED", planResult.error.message);
  }

  if (planResult.plan.approvalRequired) {
    return failure(
      "DEPENDENCY_INSTALL_APPROVAL_REQUIRED",
      planResult.plan.approvalReason ?? `${request.dependencyId} requires governance approval before installation`,
      planResult.plan,
    );
  }

  try {
    await mkdir(planResult.plan.managedRoot ?? managedRoot, { recursive: true });
    await mkdir(planResult.plan.binDir ?? binDir, { recursive: true });

    for (const step of planResult.plan.steps) {
      const execution = await executeInstallStep(step, request);
      if (execution.exitCode !== 0) {
        const message = execution.stderr || execution.stdout || `dependency install step failed: ${step.command}`;
        await updateManagedDependencyRecord(managedRoot, {
          dependencyId: request.dependencyId,
          sourceId: sourceLookup.source.sourceId,
          status: "failed",
          managedRoot,
          observedAt: new Date().toISOString(),
          lastError: message,
          metadata: {
            failedStep: step.stepId,
          },
        });
        return failure("DEPENDENCY_INSTALL_FAILED", message, planResult.plan);
      }
    }

    const installed = await probeDependency(request, managedRoot, sourceLookup.source);
    if (installed === undefined) {
      await updateManagedDependencyRecord(managedRoot, {
        dependencyId: request.dependencyId,
        sourceId: sourceLookup.source.sourceId,
        status: "failed",
        managedRoot,
        observedAt: new Date().toISOString(),
        lastError: "post-install probe could not locate the managed executable",
      });
      return failure(
        "DEPENDENCY_PROBE_FAILED",
        `dependency ${request.dependencyId} installed but post-install probe could not find an executable`,
        planResult.plan,
      );
    }

    try {
      await access(installed.resolvedPath);
      await chmod(installed.resolvedPath, 0o755);
    } catch {
      // best-effort
    }

    await updateManagedDependencyRecord(managedRoot, {
      dependencyId: request.dependencyId,
      sourceId: sourceLookup.source.sourceId,
      status: "installed",
      managedRoot,
      resolvedPath: installed.resolvedPath,
      version: installed.version,
      observedAt: new Date().toISOString(),
      metadata: {
        installedNow: true,
      },
    });

    return {
      ok: true,
      availability: {
        dependencyId: request.dependencyId,
        sourceId: sourceLookup.source.sourceId,
        managedRoot,
        binDir,
        resolvedPath: installed.resolvedPath,
        version: installed.version,
        installedNow: true,
        audit: {
          event: "agentCore.basicToolLayer.toolDependency.installer.ensured",
          metadata: {
            dependencyId: request.dependencyId,
            sourceId: sourceLookup.source.sourceId,
            installedNow: true,
          },
        },
      },
      events: ["agentCore.basicToolLayer.toolDependency.installer.installed"],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : `dependency install failed for ${request.dependencyId}`;
    await updateManagedDependencyRecord(managedRoot, {
      dependencyId: request.dependencyId,
      sourceId: sourceLookup.source.sourceId,
      status: "failed",
      managedRoot,
      observedAt: new Date().toISOString(),
      lastError: message,
    });
    return failure("DEPENDENCY_INSTALL_FAILED", message, planResult.plan);
  }
}
