/*
 * Runtime dependency plane / trusted managed installer.
 * Purpose: install only trusted managed dependency sources into the storage-plane
 * tool-deps root, then record public-safe state.
 */

import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  canonicalDependencyId,
  type DependencyAvailability,
  type DependencyPlaneContext,
  type DependencyPlaneResult,
  type DependencySource,
} from "./dependencyTypes.js";
import {
  defaultManagedRoot,
  lookupDependencySource,
  planDependencyInstallation,
  type DependencySourceRegistry,
} from "./dependencySourceRegistry.js";
import { probeDependency } from "./dependencyProbeRunner.js";
import { writeManagedDependencyRecord, writeProjectDependencyLockEntry } from "./dependencyManagedState.js";

export const dependencyInstallerDescriptor = {
  surface: "runtime.dependencyPlane.installer",
  installsOnlyTrustedManaged: true,
  writesSecrets: false,
} as const;

function failure<TValue>(
  code: string,
  message: string,
  boundary: "contract" | "filesystem" | "process" = "contract",
): DependencyPlaneResult<TValue> {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.dependency.install.rejected"],
  };
}

function mergeEnv(
  base: DependencyPlaneContext["env"] | undefined,
  override: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string | undefined>> | undefined {
  if (base === undefined && override === undefined) return undefined;
  return { ...(base ?? {}), ...(override ?? {}) };
}

function isManagedResolvedPath(managedRoot: string, resolvedPath: string | undefined): boolean {
  if (resolvedPath === undefined) return false;
  const relative = path.relative(managedRoot, resolvedPath);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function writeProjectLockForAvailability(input: {
  lockPath: string;
  dependencyId: string;
  sourceId: string;
  version?: string;
  resolvedPath?: string;
  managedRoot: string;
}): Promise<void> {
  await writeProjectDependencyLockEntry({
    lockPath: input.lockPath,
    entry: {
      dependencyId: input.dependencyId,
      sourceId: input.sourceId,
      lockedVersion: input.version,
      resolvedPathRef: input.resolvedPath,
      stateRecordRef: isManagedResolvedPath(input.managedRoot, input.resolvedPath)
        ? `${input.managedRoot}/state.json#${input.dependencyId}`
        : undefined,
    },
  });
}

async function runInstallStep(input: {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  timeoutMs?: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: true } | { ok: false; message: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const child = spawn(input.command, [...input.args], {
      cwd: input.cwd,
      env: { ...process.env, ...(input.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, message: "dependency install timed out" });
    }, input.timeoutMs ?? 120_000);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => finish({ ok: false, message: error.message }));
    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      finish({ ok: false, message: stderr.trim() || `dependency install exited with ${code}` });
    });
  });
}

export async function ensureDependencyAvailable(input: {
  dependencyId: string;
  source?: DependencySource;
  context?: DependencyPlaneContext;
  registry?: DependencySourceRegistry;
  allowInstall?: boolean;
}): Promise<DependencyPlaneResult<DependencyAvailability>> {
  const dependencyId = canonicalDependencyId(input.dependencyId);
  const sourceResult = input.source === undefined ? lookupDependencySource(dependencyId, input.registry) : { ok: true as const, value: input.source, events: [] };
  if (!sourceResult.ok) return sourceResult;
  const source = sourceResult.value;
  const managedRoot = defaultManagedRoot({
    raxToolDepsRoot: input.context?.managedRoot,
    env: input.context?.env,
    homeDir: input.context?.homeDir,
  });
  const firstProbe = await probeDependency({ dependencyId, source, context: input.context, registry: input.registry });
  if (firstProbe.available) {
    if (input.context?.projectLockPath !== undefined) {
      try {
        await writeProjectLockForAvailability({
          lockPath: input.context.projectLockPath,
          dependencyId,
          sourceId: source.sourceId,
          version: firstProbe.version,
          resolvedPath: firstProbe.resolvedPath,
          managedRoot,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return failure("DEPENDENCY_STATE_WRITE_FAILED", message, "filesystem");
      }
    }
    return {
      ok: true,
      value: {
        dependencyId,
        status: "available",
        available: true,
        version: firstProbe.version,
        resolvedPath: firstProbe.resolvedPath,
        sourceId: source.sourceId,
        publicSafe: true,
      },
      events: ["runtime.dependency.probe.completed", "runtime.dependency.available"],
    };
  }
  if (input.allowInstall === false || input.context?.dryRun === true) {
    return failure("DEPENDENCY_INSTALL_NOT_ALLOWED", `dependency ${dependencyId} is not installed and install is not allowed`);
  }
  if (source.safety !== "trusted-managed") {
    return failure("DEPENDENCY_INSTALL_REQUIRES_APPROVAL", `dependency ${dependencyId} is not a trusted managed dependency`);
  }
  const plan = planDependencyInstallation({ dependencyId, source, managedRoot, env: input.context?.env, homeDir: input.context?.homeDir });
  if (!plan.ok) return plan;
  await mkdir(plan.value.binDir, { recursive: true });
  for (const step of plan.value.steps) {
    const result = await runInstallStep({
      command: step.command,
      args: step.args,
      cwd: step.cwd,
      env: mergeEnv(input.context?.env, step.env),
      timeoutMs: input.context?.installTimeoutMs,
    });
    if (!result.ok) {
      return failure("DEPENDENCY_INSTALL_FAILED", result.message, "process");
    }
  }
  const executable = source.executableName;
  if (source.packageManager === "manual" && executable !== undefined) {
    const target = path.join(plan.value.binDir, executable);
    try {
      await chmod(target, 0o755);
    } catch {
      // Some manual recipes are setup-only probes.
    }
  }
  const probe = await probeDependency({ dependencyId, source, context: { ...input.context, managedRoot }, registry: input.registry });
  if (!probe.available) {
    return failure("DEPENDENCY_PROBE_AFTER_INSTALL_FAILED", probe.message ?? `dependency ${dependencyId} was installed but not found`, "process");
  }
  const now = input.context?.now?.() ?? new Date().toISOString();
  try {
    await writeManagedDependencyRecord({
      managedRoot,
      record: {
        dependencyId,
        sourceId: source.sourceId,
        status: "installed",
        version: probe.version,
        resolvedPath: probe.resolvedPath,
        installedAt: now,
        updatedAt: now,
      },
    });
    if (input.context?.projectLockPath !== undefined) {
      await writeProjectLockForAvailability({
        lockPath: input.context.projectLockPath,
        dependencyId,
        sourceId: source.sourceId,
        version: probe.version,
        resolvedPath: probe.resolvedPath,
        managedRoot,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure("DEPENDENCY_STATE_WRITE_FAILED", message, "filesystem");
  }
  return {
    ok: true,
    value: {
      dependencyId,
      status: "installed",
      available: true,
      installedNow: true,
      version: probe.version,
      resolvedPath: probe.resolvedPath,
      sourceId: source.sourceId,
      publicSafe: true,
    },
    events: [
      "runtime.dependency.install.started",
      "runtime.dependency.install.completed",
      "runtime.dependency.probe.completed",
    ],
  };
}
