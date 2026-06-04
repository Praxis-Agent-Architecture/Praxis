/*
 * Runtime dependency plane / source registry.
 * Purpose: keep official and developer dependency recipes inspectable, ordered,
 * and product-home agnostic.
 */

import os from "node:os";
import path from "node:path";

import {
  canonicalDependencyId,
  type DependencyInstallPlan,
  type DependencyPlaneResult,
  type DependencySource,
} from "./dependencyTypes.js";

export const dependencySourceRegistryDescriptor = {
  surface: "runtime.dependencyPlane.sourceRegistry",
  priorityOrder: ["agent", "project", "plugin", "official"],
  tapBypassForTrustedManaged: true,
  defaultManagedRootRef: "rax.home.toolDeps",
} as const;

export type DependencySourceLayer = "agent" | "project" | "plugin" | "official";

export type DependencySourceRegistry = {
  sources: readonly DependencySource[];
  warnings: readonly string[];
};

function source(input: DependencySource): DependencySource {
  return {
    ...input,
    dependencyId: canonicalDependencyId(input.dependencyId),
  };
}

export const officialDependencySources = [
  source({
    dependencyId: "dependency.lsp.typescriptLanguageServer",
    sourceId: "official:npm:typescript-language-server",
    displayName: "TypeScript language server",
    kind: "npm",
    safety: "trusted-managed",
    packageManager: "npm",
    packageName: "typescript-language-server",
    executableName: "typescript-language-server",
    versionCommand: { command: "typescript-language-server", args: ["--version"] },
    managedInstall: { command: "npm", args: ["install", "--prefix", "{managedRoot}", "typescript-language-server", "typescript"] },
  }),
  source({
    dependencyId: "dependency.lsp.csharpLs",
    sourceId: "official:dotnet-tool:csharp-ls",
    displayName: "C# language server",
    kind: "dotnet-tool",
    safety: "trusted-managed",
    packageManager: "dotnet-tool",
    packageName: "csharp-ls",
    executableName: "csharp-ls",
    versionCommand: { command: "csharp-ls", args: ["--version"] },
    managedInstall: { command: "dotnet", args: ["tool", "install", "csharp-ls", "--tool-path", "{binDir}"] },
  }),
  source({
    dependencyId: "dependency.lsp.pyrightLangserver",
    sourceId: "official:npm:pyright",
    displayName: "Pyright language server",
    kind: "npm",
    safety: "trusted-managed",
    packageManager: "npm",
    packageName: "pyright",
    executableName: "pyright-langserver",
    versionCommand: { command: "pyright-langserver", args: ["--version"] },
    managedInstall: { command: "npm", args: ["install", "--prefix", "{managedRoot}", "pyright"] },
  }),
  source({
    dependencyId: "dependency.lsp.rustAnalyzer",
    sourceId: "official:detect:rust-analyzer",
    displayName: "Rust analyzer",
    kind: "binary",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "rust-analyzer",
    versionCommand: { command: "rust-analyzer", args: ["--version"] },
  }),
  source({
    dependencyId: "dependency.lsp.gopls",
    sourceId: "official:detect:gopls",
    displayName: "Go language server",
    kind: "binary",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "gopls",
    versionCommand: { command: "gopls", args: ["version"] },
  }),
  source({
    dependencyId: "dependency.lsp.clangd",
    sourceId: "official:detect:clangd",
    displayName: "Clangd",
    kind: "binary",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "clangd",
    versionCommand: { command: "clangd", args: ["--version"] },
  }),
  source({
    dependencyId: "dependency.lsp.jdtls",
    sourceId: "official:detect:jdtls",
    displayName: "Java language server",
    kind: "binary",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "jdtls",
    versionCommand: { command: "jdtls", args: ["--version"] },
  }),
  source({
    dependencyId: "dependency.lsp.sourcekitLsp",
    sourceId: "official:detect:sourcekit-lsp",
    displayName: "SourceKit-LSP",
    kind: "binary",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "sourcekit-lsp",
    versionCommand: { command: "sourcekit-lsp", args: ["--version"] },
  }),
  source({
    dependencyId: "dependency.lsp.kotlinLanguageServer",
    sourceId: "official:detect:kotlin-language-server",
    displayName: "Kotlin language server",
    kind: "binary",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "kotlin-language-server",
    versionCommand: { command: "kotlin-language-server", args: ["--version"] },
  }),
  source({
    dependencyId: "dependency.binary.rg",
    sourceId: "official:detect:rg",
    displayName: "ripgrep",
    kind: "binary",
    safety: "system-detect-only",
    packageManager: "detect-only",
    executableName: "rg",
    versionCommand: { command: "rg", args: ["--version"] },
  }),
  source({
    dependencyId: "dependency.binary.raxcell",
    sourceId: "official:detect:raxcell",
    displayName: "Raxcell sandbox provider",
    kind: "binary",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "raxcell",
    versionCommand: { command: "raxcell", args: ["--version"] },
    supportedPlatforms: ["linux"],
    installInstructions: "Install @praxis-ai/raxcell with Praxis/Raxode, or set RAXCELL_BIN to an explicit provider binary path.",
  }),
  source({
    dependencyId: "dependency.binary.bwrap",
    sourceId: "official:detect:bwrap",
    displayName: "bubblewrap",
    kind: "binary",
    safety: "system-detect-only",
    packageManager: "detect-only",
    executableName: "bwrap",
    versionCommand: { command: "bwrap", args: ["--version"] },
    supportedPlatforms: ["linux"],
    installInstructions: "Install bubblewrap with your OS package manager, for example apt install bubblewrap.",
  }),
  source({
    dependencyId: "dependency.binary.podmanOrDocker",
    sourceId: "official:detect:podman-or-docker",
    displayName: "Podman or Docker container runtime",
    kind: "binary",
    safety: "system-detect-only",
    packageManager: "detect-only",
    versionCommand: {
      command: "sh",
      args: [
        "-c",
        [
          "for cmd in podman docker; do",
          "  if command -v \"$cmd\" >/dev/null 2>&1; then",
          "    \"$cmd\" --version;",
          "    exit 0;",
          "  fi;",
          "done;",
          "printf 'no podman or docker runtime found\\n' >&2;",
          "exit 1;",
        ].join(" "),
      ],
    },
    supportedPlatforms: ["linux", "darwin"],
    installInstructions: "Install Podman or Docker with your OS package manager or desktop container runtime.",
  }),
  source({
    dependencyId: "dependency.macos.containerization",
    sourceId: "official:detect:macos-containerization",
    displayName: "macOS native sandbox runtime",
    kind: "runtime",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    versionCommand: { command: "sh", args: ["-c", "command -v sandbox-exec >/dev/null 2>&1 && printf 'macos sandbox-exec\\n'"] },
    supportedPlatforms: ["darwin"],
    installInstructions: "macOS sandbox support is provided by the host operating system.",
  }),
  source({
    dependencyId: "dependency.windows.sandbox",
    sourceId: "official:detect:windows-sandbox",
    displayName: "Windows Sandbox runtime",
    kind: "runtime",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "powershell.exe",
    versionCommand: { command: "powershell.exe", args: ["-NoProfile", "-Command", "Write-Output windows-sandbox"] },
    supportedPlatforms: ["win32"],
    installInstructions: "Enable Windows Sandbox from Windows optional features.",
  }),
  source({
    dependencyId: "dependency.remote.raxosWorker",
    sourceId: "official:manual:raxos-worker",
    displayName: "Raxos remote worker",
    kind: "runtime",
    safety: "trusted-detect-only",
    packageManager: "manual",
    installInstructions: "Configure a Raxos remote worker endpoint through the application runtime.",
  }),
  source({
    dependencyId: "dependency.binary.ffmpeg",
    sourceId: "official:detect:ffmpeg",
    displayName: "ffmpeg",
    kind: "binary",
    safety: "system-detect-only",
    packageManager: "detect-only",
    executableName: "ffmpeg",
    versionCommand: { command: "ffmpeg", args: ["-version"] },
  }),
  source({
    dependencyId: "dependency.binary.imagemagick",
    sourceId: "official:detect:imagemagick",
    displayName: "ImageMagick",
    kind: "binary",
    safety: "system-detect-only",
    packageManager: "detect-only",
    executableName: "magick",
    versionCommand: { command: "magick", args: ["--version"] },
  }),
  source({
    dependencyId: "dependency.binary.xdotool",
    sourceId: "official:detect:xdotool",
    displayName: "xdotool",
    kind: "binary",
    safety: "system-detect-only",
    packageManager: "detect-only",
    executableName: "xdotool",
    versionCommand: { command: "xdotool", args: ["--version"] },
  }),
  source({
    dependencyId: "dependency.binary.ydotool",
    sourceId: "official:detect:ydotool",
    displayName: "ydotool",
    kind: "binary",
    safety: "system-detect-only",
    packageManager: "detect-only",
    executableName: "ydotool",
    versionCommand: { command: "ydotool", args: ["--version"] },
  }),
  source({
    dependencyId: "dependency.desktop.screenshotProvider.linux",
    sourceId: "official:detect:linux-screenshot-provider",
    displayName: "Linux desktop screenshot provider",
    kind: "runtime",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "sh",
    versionCommand: {
      command: "sh",
      args: [
        "-c",
        [
          "for cmd in grim gnome-screenshot spectacle import; do",
          "  if command -v \"$cmd\" >/dev/null 2>&1; then",
          "    printf 'linux-screenshot-provider %s\\n' \"$cmd\";",
          "    exit 0;",
          "  fi;",
          "done;",
          "if command -v xdg-desktop-portal >/dev/null 2>&1 && command -v gdbus >/dev/null 2>&1; then",
          "  printf 'linux-screenshot-provider xdg-desktop-portal\\n';",
          "  exit 0;",
          "fi;",
          "printf 'no linux screenshot provider found\\n' >&2;",
          "exit 1;",
        ].join(" "),
      ],
    },
    supportedPlatforms: ["linux"],
  }),
  source({
    dependencyId: "dependency.npm.playwright",
    sourceId: "official:npm:playwright",
    displayName: "Playwright browser runtime",
    kind: "npm",
    safety: "trusted-managed",
    packageManager: "npm",
    packageName: "playwright",
    executableName: "playwright",
    versionCommand: { command: "playwright", args: ["--version"] },
    managedInstall: { command: "npm", args: ["install", "--prefix", "{managedRoot}", "playwright"] },
  }),
  source({
    dependencyId: "dependency.mcp.testServer.echo",
    sourceId: "official:managed:mcp-echo",
    displayName: "MCP echo test server",
    kind: "mcp-server",
    safety: "trusted-managed",
    packageManager: "manual",
    executableName: "praxis-mcp-echo",
    versionCommand: { command: "praxis-mcp-echo", args: ["--version"] },
    managedInstall: {
      command: process.execPath,
      args: [
        "-e",
        "const fs=require('node:fs');const path=require('node:path');const binDir=process.argv[1];const target=path.join(binDir,'praxis-mcp-echo');fs.mkdirSync(binDir,{recursive:true});fs.writeFileSync(target,\"#!/usr/bin/env node\\nif (process.argv.includes('--version')) { console.log('praxis-mcp-echo 0.1.0'); process.exit(0); }\\nconsole.log('praxis-mcp-echo ready');\\n\",{mode:0o755});",
        "{binDir}",
      ],
    },
  }),
] as const satisfies readonly DependencySource[];

function failure<TValue>(code: string, message: string): DependencyPlaneResult<TValue> {
  return {
    ok: false,
    error: { code, message, boundary: "dependency", publicSafe: true },
    events: ["runtime.dependency.source.rejected"],
  };
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function defaultManagedRoot(input: { raxToolDepsRoot?: string; env?: Readonly<Record<string, string | undefined>>; homeDir?: string } = {}): string {
  if (hasText(input.raxToolDepsRoot)) return path.resolve(input.raxToolDepsRoot);
  const praxisHome = hasText(input.env?.PRAXIS_HOME)
    ? input.env.PRAXIS_HOME
    : hasText(input.env?.RAX_HOME)
      ? input.env.RAX_HOME
      : undefined;
  if (praxisHome !== undefined) return path.join(path.resolve(praxisHome), "tool-deps");
  const homeDir = hasText(input.homeDir) ? input.homeDir : undefined;
  return path.join(homeDir ?? os.homedir(), ".rax", "tool-deps");
}

export function createDependencySourceRegistry(input: {
  agent?: readonly DependencySource[];
  project?: readonly DependencySource[];
  plugin?: readonly DependencySource[];
  official?: readonly DependencySource[];
} = {}): DependencySourceRegistry {
  const layers: readonly [DependencySourceLayer, readonly DependencySource[]][] = [
    ["official", input.official ?? officialDependencySources],
    ["plugin", input.plugin ?? []],
    ["project", input.project ?? []],
    ["agent", input.agent ?? []],
  ];
  const byId = new Map<string, DependencySource>();
  const warnings: string[] = [];
  for (const [layer, sources] of layers) {
    for (const item of sources) {
      const normalized = source(item);
      if (byId.has(normalized.dependencyId)) {
        warnings.push(`runtime.dependency.source.override:${normalized.dependencyId}:${layer}`);
      }
      byId.set(normalized.dependencyId, normalized);
    }
  }
  return { sources: [...byId.values()], warnings };
}

export function lookupDependencySource(
  dependencyId: string,
  registry: DependencySourceRegistry = createDependencySourceRegistry(),
): DependencyPlaneResult<DependencySource> {
  const canonical = canonicalDependencyId(dependencyId);
  const found = registry.sources.find((item) => item.dependencyId === canonical);
  if (found === undefined) {
    return failure("DEPENDENCY_SOURCE_NOT_FOUND", `dependency source is not registered: ${canonical}`);
  }
  return { ok: true, value: found, events: ["runtime.dependency.source.found"] };
}

function replaceTemplate(value: string, replacements: Readonly<Record<string, string>>): string {
  return Object.entries(replacements).reduce((next, [key, replacement]) => next.replaceAll(`{${key}}`, replacement), value);
}

export function planDependencyInstallation(input: {
  dependencyId: string;
  source?: DependencySource;
  managedRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
  registry?: DependencySourceRegistry;
}): DependencyPlaneResult<DependencyInstallPlan> {
  const sourceResult = input.source === undefined
    ? lookupDependencySource(input.dependencyId, input.registry)
    : { ok: true as const, value: source(input.source), events: ["runtime.dependency.source.inline"] };
  if (!sourceResult.ok) return sourceResult;

  const dependencySource = sourceResult.value;
  const managedRoot = defaultManagedRoot({ raxToolDepsRoot: input.managedRoot, env: input.env, homeDir: input.homeDir });
  const binDir = path.join(managedRoot, "bin");
  const installable = dependencySource.managedInstall !== undefined && dependencySource.safety === "trusted-managed";
  if (!installable) {
    return failure(
      "INSTALL_RECIPE_UNAVAILABLE",
      dependencySource.installInstructions ?? `dependency ${dependencySource.dependencyId} has no trusted managed install recipe`,
    );
  }

  const installCommand = dependencySource.managedInstall;
  if (installCommand === undefined) {
    return failure("INSTALL_RECIPE_UNAVAILABLE", `dependency ${dependencySource.dependencyId} has no trusted managed install recipe`);
  }
  const replacements = { managedRoot, binDir };
  return {
    ok: true,
    value: {
      dependencyId: dependencySource.dependencyId,
      sourceId: dependencySource.sourceId,
      safety: dependencySource.safety,
      target: "praxis-managed",
      packageManager: dependencySource.packageManager,
      managedRoot,
      binDir,
      approvalRequired: dependencySource.safety !== "trusted-managed",
      installable: true,
      steps: [{
        command: replaceTemplate(installCommand.command, replacements),
        args: (installCommand.args ?? []).map((arg) => replaceTemplate(arg, replacements)),
        env: installCommand.env,
      }],
      reason: `dependency ${dependencySource.dependencyId} can be prepared in the Praxis managed tool-deps root`,
    },
    events: ["runtime.dependency.install.plan.created"],
  };
}
