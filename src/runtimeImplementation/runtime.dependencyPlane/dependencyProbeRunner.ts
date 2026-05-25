/*
 * Runtime dependency plane / probe runner.
 * Purpose: probe managed and host dependencies without mutating the system.
 */

import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  canonicalDependencyId,
  type DependencyCommandSpec,
  type DependencyPlaneContext,
  type DependencyProbe,
  type DependencySource,
} from "./dependencyTypes.js";
import { defaultManagedRoot, lookupDependencySource, type DependencySourceRegistry } from "./dependencySourceRegistry.js";

export const dependencyProbeRunnerDescriptor = {
  surface: "runtime.dependencyPlane.probeRunner",
  mutatesHost: false,
  searchOrder: ["praxis-managed-bin", "praxis-managed-node-bin", "PATH"],
} as const;

async function executableExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function splitPath(envPath: string | undefined): readonly string[] {
  return (envPath ?? process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
}

async function runDependencyCommand(input: {
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
  cwd?: string;
  timeoutMs?: number;
}): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: true; stdout: string } | { ok: false; message: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const child = spawn(input.command, [...(input.args ?? [])], {
      cwd: input.cwd,
      env: { ...process.env, ...(input.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, message: "dependency probe timed out" });
    }, input.timeoutMs ?? 10_000);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish({ ok: false, message: error.message });
    });
    child.on("close", (code) => {
      if (code === 0) {
        finish({ ok: true, stdout: stdout.trim() || stderr.trim() });
        return;
      }
      finish({ ok: false, message: stderr.trim() || stdout.trim() || `dependency probe exited with ${code}` });
    });
  });
}

function commandEnv(
  contextEnv: DependencyPlaneContext["env"] | undefined,
  commandEnv: DependencyCommandSpec["env"] | undefined,
): Readonly<Record<string, string | undefined>> | undefined {
  if (contextEnv === undefined && commandEnv === undefined) return undefined;
  return { ...(contextEnv ?? {}), ...(commandEnv ?? {}) };
}

function candidatePaths(source: DependencySource, managedRoot: string, envPath: string | undefined): readonly string[] {
  const executable = source.executableName;
  if (executable === undefined || executable.trim().length === 0) return [];
  return [
    path.join(managedRoot, "bin", executable),
    path.join(managedRoot, "node_modules", ".bin", executable),
    ...splitPath(envPath).map((entry) => path.join(entry, executable)),
  ];
}

function firstLine(output: string): string | undefined {
  const line = output.split(/\r?\n/u)[0]?.trim();
  return line === undefined || line.length === 0 ? undefined : line;
}

async function runSourceCheck(input: {
  command: string;
  args?: readonly string[];
  spec: DependencyCommandSpec;
  context?: DependencyPlaneContext;
}): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return await runDependencyCommand({
    command: input.command,
    args: input.args ?? input.spec.args,
    env: commandEnv(input.context?.env, input.spec.env),
    cwd: input.context?.cwd,
  });
}

export async function probeDependency(input: {
  dependencyId: string;
  source?: DependencySource;
  context?: DependencyPlaneContext;
  registry?: DependencySourceRegistry;
}): Promise<DependencyProbe> {
  const dependencyId = canonicalDependencyId(input.dependencyId);
  const sourceResult = input.source === undefined ? lookupDependencySource(dependencyId, input.registry) : { ok: true as const, value: input.source };
  if (!sourceResult.ok) {
    return {
      dependencyId,
      available: false,
      status: "unknown",
      message: sourceResult.error.message,
      observedAt: input.context?.now?.() ?? new Date().toISOString(),
    };
  }
  const source = sourceResult.value;
  if (source.supportedPlatforms !== undefined && !source.supportedPlatforms.includes(process.platform)) {
    return {
      dependencyId,
      available: false,
      status: "unsupported",
      message: `dependency ${dependencyId} is not supported on ${process.platform}`,
      observedAt: input.context?.now?.() ?? new Date().toISOString(),
    };
  }
  const managedRoot = defaultManagedRoot({
    raxToolDepsRoot: input.context?.managedRoot,
    env: input.context?.env,
    homeDir: input.context?.homeDir,
  });
  let failedCandidate:
    | { resolvedPath: string; message: string }
    | undefined;
  let failedFallback: string | undefined;
  let firstExistingCandidate: string | undefined;
  for (const candidate of candidatePaths(source, managedRoot, input.context?.env?.PATH)) {
    if (await executableExists(candidate)) {
      firstExistingCandidate ??= candidate;
      if (source.versionCommand === undefined) {
        if (source.probe !== undefined) continue;
        return {
          dependencyId,
          available: true,
          status: "available",
          resolvedPath: candidate,
          observedAt: input.context?.now?.() ?? new Date().toISOString(),
        };
      }
      const result = await runSourceCheck({
        command: candidate,
        spec: source.versionCommand,
        context: input.context,
      });
      if (result.ok === false) {
        failedCandidate ??= { resolvedPath: candidate, message: result.message };
        continue;
      }
      return {
        dependencyId,
        available: true,
        status: "available",
        version: firstLine(result.stdout),
        resolvedPath: candidate,
        observedAt: input.context?.now?.() ?? new Date().toISOString(),
      };
    }
  }
  if (source.versionCommand !== undefined) {
    const version = await runSourceCheck({
      command: source.versionCommand.command,
      spec: source.versionCommand,
      context: input.context,
    });
    if (version.ok) {
      return {
        dependencyId,
        available: true,
        status: "available",
        version: firstLine(version.stdout),
        observedAt: input.context?.now?.() ?? new Date().toISOString(),
      };
    }
    failedFallback = version.message;
  }
  if (source.probe !== undefined) {
    const probe = await runSourceCheck({
      command: source.probe.command,
      spec: source.probe,
      context: input.context,
    });
    if (probe.ok) {
      return {
        dependencyId,
        available: true,
        status: "available",
        resolvedPath: firstExistingCandidate,
        observedAt: input.context?.now?.() ?? new Date().toISOString(),
      };
    }
    failedFallback = probe.message;
  }
  return {
    dependencyId,
    available: false,
    status: source.managedInstall === undefined ? "missing" : "installable",
    resolvedPath: failedCandidate?.resolvedPath,
    message: failedCandidate?.message ?? failedFallback ?? (
      source.managedInstall === undefined
        ? "dependency is not available"
        : "dependency can be installed in the managed root"
    ),
    observedAt: input.context?.now?.() ?? new Date().toISOString(),
  };
}
