/*
 * 文件定位：raxode-cli/backend application local readiness probe。
 * 核心目的：无副作用探测 Raxode 后端启动前置条件，并把结果交给 readiness 事件消费。
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { AgentManifest } from "@praxis-ai/praxis";

export type RaxodeDependencyProbeStatus = "ready" | "missing" | "not-probed" | "version-mismatch";
export type RaxodeSandboxProbeStatus = "ready" | "degraded" | "not-required";

export type RaxodeDependencyProbe = {
  dependencyId: string;
  status: RaxodeDependencyProbeStatus;
  required: boolean;
  observedVersion?: string;
  resolvedPath?: string;
  source: "process" | "node-resolution" | "auth-plane" | "manifest";
  degrade: string;
  message?: string;
};

export type RaxodeSandboxProbe = {
  profile: string;
  providerFamily: string;
  status: RaxodeSandboxProbeStatus;
  fallback: "workspace-rollback";
  executable?: string;
  message?: string;
};

export type RaxodeLocalReadinessProbe = {
  kind: "raxode.localReadinessProbe";
  schemaVersion: "raxode.localReadinessProbe.v1";
  generatedAt: string;
  dependencies: readonly RaxodeDependencyProbe[];
  sandbox: RaxodeSandboxProbe;
};

export type RaxodeLocalReadinessProbeInput = {
  manifest: AgentManifest;
  now?: () => string;
  nodeVersion?: string;
  pathEnv?: string;
  env?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
  fileExists?: (filePath: string) => boolean;
  resolvePackage?: (packageName: string) => string | undefined;
};

const requireFromHere = createRequire(import.meta.url);

function normalizeNodeVersion(version: string): string {
  return version.trim().replace(/^v/u, "");
}

function parseSemver(version: string): { major: number; minor: number; patch: number } | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(normalizeNodeVersion(version));
  if (match === null) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function nodeSatisfiesPraxisRange(version: string): boolean {
  const parsed = parseSemver(version);
  if (parsed === undefined) return false;
  if (parsed.major > 22) return true;
  if (parsed.major < 22) return false;
  if (parsed.minor > 22) return true;
  if (parsed.minor < 22) return false;
  return parsed.patch >= 3;
}

function defaultResolvePackage(packageName: string): string | undefined {
  try {
    return requireFromHere.resolve(packageName);
  } catch {
    return undefined;
  }
}

function executableNames(name: string, platform: NodeJS.Platform): readonly string[] {
  if (platform !== "win32") return [name];
  const extensions = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean);
  return [name, ...extensions.map((extension) => `${name}${extension.toLowerCase()}`), ...extensions.map((extension) => `${name}${extension.toUpperCase()}`)];
}

function findExecutableOnPath(input: {
  name: string;
  pathEnv?: string;
  platform?: NodeJS.Platform;
  fileExists?: (filePath: string) => boolean;
}): string | undefined {
  const platform = input.platform ?? process.platform;
  const fileExists = input.fileExists ?? existsSync;
  const entries = (input.pathEnv ?? process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of entries) {
    for (const name of executableNames(input.name, platform)) {
      const candidate = path.join(entry, name);
      if (fileExists(candidate)) return candidate;
    }
  }
  return undefined;
}

function dependencyDegrade(dependencyId: string): string {
  if (dependencyId === "dependency.binary.node") return "block-backend-start";
  if (dependencyId === "dependency.npm.tsx") return "use-built-dist-or-install";
  if (dependencyId === "dependency.binary.raxcell") return "degrade-to-workspace-rollback";
  if (dependencyId === "dependency.binary.bwrap") return "degrade-to-workspace-rollback";
  if (dependencyId === "dependency.secret.provider.core.main") return "dry-run-or-auth-required-for-live";
  return "record-and-continue";
}

function resolveRaxcellExecutable(input: {
  pathEnv?: string;
  env?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
  fileExists?: (filePath: string) => boolean;
  resolvePackage?: (packageName: string) => string | undefined;
}): string | undefined {
  const explicitBinary = (input.env?.RAXCELL_BIN ?? process.env.RAXCELL_BIN)?.trim();
  const fileExists = input.fileExists ?? existsSync;
  if (explicitBinary !== undefined && explicitBinary.length > 0) {
    return fileExists(explicitBinary) ? explicitBinary : undefined;
  }
  const fromPath = findExecutableOnPath({
    name: "raxcell",
    pathEnv: input.pathEnv,
    platform: input.platform,
    fileExists,
  });
  if (fromPath !== undefined) return fromPath;
  const resolvedPackage = input.resolvePackage?.("@praxis-ai/raxcell/package.json");
  if (resolvedPackage === undefined) return undefined;
  const packageBinary = path.resolve(path.dirname(resolvedPackage), "dist/cli.js");
  return fileExists(packageBinary) ? packageBinary : undefined;
}

function probeDependency(input: {
  dependencyId: string;
  required: boolean;
  nodeVersion: string;
  pathEnv?: string;
  env?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
  fileExists?: (filePath: string) => boolean;
  resolvePackage: (packageName: string) => string | undefined;
}): RaxodeDependencyProbe {
  const degrade = dependencyDegrade(input.dependencyId);
  if (input.dependencyId === "dependency.binary.node") {
    const ready = nodeSatisfiesPraxisRange(input.nodeVersion);
    return {
      dependencyId: input.dependencyId,
      status: ready ? "ready" : "version-mismatch",
      required: input.required,
      observedVersion: input.nodeVersion,
      source: "process",
      degrade,
      message: ready
        ? "Node.js satisfies Praxis package range >=22.22.3."
        : "Node.js is outside Praxis package range >=22.22.3.",
    };
  }
  if (input.dependencyId === "dependency.npm.tsx") {
    const resolvedPath = input.resolvePackage("tsx");
    return {
      dependencyId: input.dependencyId,
      status: resolvedPath === undefined ? "missing" : "ready",
      required: input.required,
      resolvedPath,
      source: "node-resolution",
      degrade,
      message: resolvedPath === undefined
        ? "tsx is not resolvable from the Raxode backend package."
        : "tsx is resolvable from the Raxode backend package.",
    };
  }
  if (input.dependencyId === "dependency.binary.raxcell") {
    const resolvedPath = resolveRaxcellExecutable({
      pathEnv: input.pathEnv,
      env: input.env,
      platform: input.platform,
      fileExists: input.fileExists,
      resolvePackage: input.resolvePackage,
    });
    return {
      dependencyId: input.dependencyId,
      status: resolvedPath === undefined ? "missing" : "ready",
      required: input.required,
      resolvedPath,
      source: "process",
      degrade,
      message: resolvedPath === undefined
        ? "Raxcell is not configured through RAXCELL_BIN, PATH, or the installed @praxis-ai/raxcell package; linux-bubblewrap will degrade to workspace-rollback."
        : "Raxcell is available for linux-bubblewrap sandbox execution.",
    };
  }
  if (input.dependencyId === "dependency.binary.bwrap") {
    const resolvedPath = findExecutableOnPath({
      name: "bwrap",
      pathEnv: input.pathEnv,
      platform: input.platform,
      fileExists: input.fileExists,
    });
    return {
      dependencyId: input.dependencyId,
      status: resolvedPath === undefined ? "missing" : "ready",
      required: input.required,
      resolvedPath,
      source: "process",
      degrade,
      message: resolvedPath === undefined
        ? "bwrap is not on PATH; linux-bubblewrap will degrade to workspace-rollback."
        : "bwrap is available for linux-bubblewrap sandbox execution.",
    };
  }
  if (input.dependencyId === "dependency.secret.provider.core.main") {
    return {
      dependencyId: input.dependencyId,
      status: "not-probed",
      required: input.required,
      source: "auth-plane",
      degrade,
      message: "Secrets are intentionally not read by local readiness; auth-plane resolves them at runtime.",
    };
  }
  return {
    dependencyId: input.dependencyId,
    status: "not-probed",
    required: input.required,
    source: "manifest",
    degrade,
    message: "No local probe is registered for this dependency.",
  };
}

function probeSandbox(input: {
  manifest: AgentManifest;
  pathEnv?: string;
  env?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
  fileExists?: (filePath: string) => boolean;
  resolvePackage?: (packageName: string) => string | undefined;
}): RaxodeSandboxProbe {
  const profile = input.manifest.sandbox.profile;
  const providerFamily = input.manifest.sandbox.providerFamily ?? profile;
  if (profile === "host-observed") {
    return {
      profile,
      providerFamily,
      status: "not-required",
      fallback: "workspace-rollback",
      message: "host-observed mode does not require an external sandbox binary.",
    };
  }
  if (profile === "workspace-only" || profile === "workspaceOnly") {
    return {
      profile,
      providerFamily,
      status: "ready",
      fallback: "workspace-rollback",
      message: "workspace rollback is implemented in the Praxis sandbox plane.",
    };
  }
  if (profile === "linux-bubblewrap" || profile === "linuxBubblewrap") {
    const executable = resolveRaxcellExecutable({
      pathEnv: input.pathEnv,
      env: input.env,
      platform: input.platform,
      fileExists: input.fileExists,
      resolvePackage: input.resolvePackage,
    });
    return {
      profile,
      providerFamily,
      status: executable === undefined ? "degraded" : "ready",
      fallback: "workspace-rollback",
      executable,
      message: executable === undefined
        ? "Raxcell was not found through RAXCELL_BIN, PATH, or the installed @praxis-ai/raxcell package; runtime should degrade to workspace-rollback."
        : "Raxcell was found for linux-bubblewrap sandbox execution.",
    };
  }
  return {
    profile,
    providerFamily,
    status: "degraded",
    fallback: "workspace-rollback",
    message: "No local sandbox probe is registered for this profile.",
  };
}

export function probeLocalRaxodeReadiness(input: RaxodeLocalReadinessProbeInput): RaxodeLocalReadinessProbe {
  const nodeVersion = input.nodeVersion ?? process.version;
  const resolvePackage = input.resolvePackage ?? defaultResolvePackage;
  return {
    kind: "raxode.localReadinessProbe",
    schemaVersion: "raxode.localReadinessProbe.v1",
    generatedAt: input.now?.() ?? new Date().toISOString(),
    dependencies: input.manifest.dependencies.map((dependency) => probeDependency({
      dependencyId: dependency.dependencyId,
      required: dependency.required ?? true,
      nodeVersion,
      pathEnv: input.pathEnv,
      env: input.env,
      platform: input.platform,
      fileExists: input.fileExists,
      resolvePackage,
    })),
    sandbox: probeSandbox({
      manifest: input.manifest,
      pathEnv: input.pathEnv,
      env: input.env,
      platform: input.platform,
      fileExists: input.fileExists,
      resolvePackage,
    }),
  };
}
