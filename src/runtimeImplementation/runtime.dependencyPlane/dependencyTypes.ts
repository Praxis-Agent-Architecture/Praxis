/*
 * Runtime dependency plane / shared contracts.
 * Purpose: describe dependency declarations, sources, probes, installs, state,
 * and project locks without binding them to a product-specific home folder.
 */

export type DependencyKind =
  | "binary"
  | "npm"
  | "dotnet-tool"
  | "secret-ref"
  | "service"
  | "mcp-server"
  | "runtime"
  | "permission"
  | "custom";

export type DependencySafety =
  | "trusted-managed"
  | "trusted-detect-only"
  | "custom-requires-approval"
  | "system-detect-only";

export type DependencyInstallPolicy = "auto" | "manual" | "disabled";

export type DependencyReadinessStatus =
  | "available"
  | "missing"
  | "installable"
  | "installing"
  | "installed"
  | "requiresApproval"
  | "blocked"
  | "unsupported"
  | "unknown";

export type DependencyCommandSpec = {
  command: string;
  args?: readonly string[];
  env?: Readonly<Record<string, string>>;
};

export type DependencyDeclaration = {
  dependencyId: string;
  kind: DependencyKind;
  required?: boolean;
  version?: string;
  acceptedVersions?: readonly string[];
  install?: DependencyInstallPolicy;
  sourceRef?: string;
  requiredScopes?: readonly string[];
  secretRef?: string;
  reason?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type DependencySource = {
  dependencyId: string;
  sourceId: string;
  displayName?: string;
  kind: DependencyKind;
  safety: DependencySafety;
  packageManager?: "manual" | "npm" | "dotnet-tool" | "detect-only";
  packageName?: string;
  executableName?: string;
  versionCommand?: DependencyCommandSpec;
  probe?: DependencyCommandSpec;
  managedInstall?: DependencyCommandSpec;
  installInstructions?: string;
  supportedPlatforms?: readonly NodeJS.Platform[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type DependencyInstallStep = {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
};

export type DependencyInstallPlan = {
  dependencyId: string;
  sourceId: string;
  safety: DependencySafety;
  target: "praxis-managed" | "system" | "external";
  packageManager?: DependencySource["packageManager"];
  managedRoot: string;
  binDir: string;
  approvalRequired: boolean;
  installable: boolean;
  steps: readonly DependencyInstallStep[];
  reason: string;
};

export type DependencyProbe = {
  dependencyId: string;
  available: boolean;
  status?: DependencyReadinessStatus;
  version?: string;
  resolvedPath?: string;
  message?: string;
  observedAt?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type DependencyAvailability = {
  dependencyId: string;
  status: DependencyReadinessStatus;
  available: boolean;
  installedNow?: boolean;
  version?: string;
  resolvedPath?: string;
  sourceId?: string;
  message?: string;
  publicSafe: true;
};

export type ManagedDependencyRecord = {
  dependencyId: string;
  sourceId?: string;
  status: DependencyReadinessStatus;
  version?: string;
  resolvedPath?: string;
  installedAt?: string;
  updatedAt: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ManagedDependencyState = {
  kind: "praxis.dependencyState";
  version: "praxis.dependencyState.v1";
  records: Record<string, ManagedDependencyRecord>;
};

export type ProjectDependencyLockEntry = {
  dependencyId: string;
  sourceId?: string;
  requestedVersion?: string;
  lockedVersion?: string;
  resolvedPathRef?: string;
  stateRecordRef?: string;
  hash?: string;
};

export type ProjectDependencyLock = {
  kind: "praxis.projectDependencyLock";
  version: "praxis.projectDependencyLock.v1";
  entries: Record<string, ProjectDependencyLockEntry>;
};

export type DependencyPlaneError = {
  code: string;
  message: string;
  boundary: "input" | "contract" | "dependency" | "filesystem" | "process" | "scope";
  publicSafe: true;
};

export type DependencyPlaneResult<TValue> =
  | { ok: true; value: TValue; events: readonly string[] }
  | { ok: false; error: DependencyPlaneError; events: readonly string[] };

export type DependencyPlaneContext = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  managedRoot?: string;
  projectLockPath?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
  cwd?: string;
  now?: () => string;
  dryRun?: boolean;
  installTimeoutMs?: number;
  allowedScopes?: readonly string[];
};

export function canonicalDependencyId(input: string): string {
  const value = input.trim();
  const legacy: Record<string, string> = {
    "binary:bwrap": "dependency.binary.bwrap",
    "binary:raxcell": "dependency.binary.raxcell",
    "binary:podman|docker": "dependency.binary.podmanOrDocker",
    "windows:Windows-Sandbox": "dependency.windows.sandbox",
    "macos:containerization": "dependency.macos.containerization",
    "remote:raxos-worker": "dependency.remote.raxosWorker",
    "runtime.binary.rg": "dependency.binary.rg",
    "runtime.binary.ffmpeg": "dependency.binary.ffmpeg",
    "runtime.binary.imagemagick": "dependency.binary.imagemagick",
    "runtime.binary.xdotool": "dependency.binary.xdotool",
    "runtime.binary.ydotool": "dependency.binary.ydotool",
    "runtime.desktop.screenshotProvider.linux": "dependency.desktop.screenshotProvider.linux",
    "mcp.testServer.echo": "dependency.mcp.testServer.echo",
    "lsp.server.typescript-language-server": "dependency.lsp.typescriptLanguageServer",
    "lsp.server.csharp-ls": "dependency.lsp.csharpLs",
    "lsp.server.pyright-langserver": "dependency.lsp.pyrightLangserver",
    "lsp.server.rust-analyzer": "dependency.lsp.rustAnalyzer",
    "lsp.server.gopls": "dependency.lsp.gopls",
    "lsp.server.clangd": "dependency.lsp.clangd",
    "lsp.server.jdtls": "dependency.lsp.jdtls",
    "lsp.server.sourcekit-lsp": "dependency.lsp.sourcekitLsp",
    "lsp.server.kotlin-language-server": "dependency.lsp.kotlinLanguageServer",
  };
  return legacy[value] ?? value;
}

export function dependencyKindFromId(input: string): DependencyKind {
  const canonical = canonicalDependencyId(input);
  if (canonical.startsWith("dependency.binary.")) return "binary";
  if (canonical.startsWith("dependency.npm.")) return "npm";
  if (canonical.startsWith("dependency.dotnetTool.")) return "dotnet-tool";
  if (canonical.startsWith("dependency.secret.")) return "secret-ref";
  if (canonical.startsWith("dependency.service.")) return "service";
  if (canonical.startsWith("dependency.mcp.")) return "mcp-server";
  if (canonical.startsWith("dependency.lsp.csharpLs")) return "dotnet-tool";
  if (canonical.startsWith("dependency.lsp.typescriptLanguageServer")) return "npm";
  if (canonical.startsWith("dependency.lsp.pyrightLangserver")) return "npm";
  if (canonical.startsWith("dependency.lsp.")) return "binary";
  if (canonical.includes(".permission.") || canonical.startsWith("dependency.permission.")) return "permission";
  return "runtime";
}

export function legacyDependencyIds(input: string): readonly string[] {
  const canonical = canonicalDependencyId(input);
  const reverse: Record<string, readonly string[]> = {
    "dependency.binary.bwrap": ["binary:bwrap"],
    "dependency.binary.raxcell": ["binary:raxcell"],
    "dependency.binary.podmanOrDocker": ["binary:podman|docker"],
    "dependency.windows.sandbox": ["windows:Windows-Sandbox"],
    "dependency.macos.containerization": ["macos:containerization"],
    "dependency.remote.raxosWorker": ["remote:raxos-worker"],
    "dependency.binary.rg": ["runtime.binary.rg"],
    "dependency.binary.ffmpeg": ["runtime.binary.ffmpeg"],
    "dependency.binary.imagemagick": ["runtime.binary.imagemagick"],
    "dependency.desktop.screenshotProvider.linux": ["runtime.desktop.screenshotProvider.linux"],
    "dependency.mcp.testServer.echo": ["mcp.testServer.echo"],
    "dependency.lsp.typescriptLanguageServer": ["lsp.server.typescript-language-server"],
    "dependency.lsp.csharpLs": ["lsp.server.csharp-ls"],
    "dependency.lsp.pyrightLangserver": ["lsp.server.pyright-langserver"],
    "dependency.lsp.rustAnalyzer": ["lsp.server.rust-analyzer"],
    "dependency.lsp.gopls": ["lsp.server.gopls"],
    "dependency.lsp.clangd": ["lsp.server.clangd"],
    "dependency.lsp.jdtls": ["lsp.server.jdtls"],
    "dependency.lsp.sourcekitLsp": ["lsp.server.sourcekit-lsp"],
    "dependency.lsp.kotlinLanguageServer": ["lsp.server.kotlin-language-server"],
  };
  return reverse[canonical] ?? [];
}
