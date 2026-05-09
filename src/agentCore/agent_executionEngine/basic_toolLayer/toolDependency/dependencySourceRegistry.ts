/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 工具依赖管理层 / 依赖源注册表。
 * 核心目的：管理可信依赖源、安装目标、版本策略和可审计安装计划。
 * 能力要求1：需要把内置依赖源和用户/系统越界源明确分级。
 * 能力要求2：正常 Praxis managed 安装不交给 TAP，越界安装才进入治理确认。
 * 边界：只生成依赖源和安装计划，不直接执行安装命令。
 * 对接：被 dependencyChecker、dependencyIterationManager 和 LSP runtime 前置依赖链消费。
 * 实现提示：优先保持 registry 数据驱动，避免把不同语言的安装逻辑散落到工具实现里。
 */

import os from "node:os";
import path from "node:path";

export type ToolDependencySourceSafety = "trusted-managed" | "trusted-detect-only" | "custom-source" | "system-global";

export type ToolDependencyInstallTarget = "praxis-managed" | "project-local" | "system-global";

export type ToolDependencyPackageManager = "npm" | "dotnet-tool" | "go-install" | "manual" | "detect-only";

export type ToolDependencyProbeCommand = {
  command: string;
  args?: readonly string[];
};

export type ToolDependencyInstallStep = {
  stepId: string;
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  writesTo: readonly string[];
  requiresSudo: boolean;
  modifiesUserShell: boolean;
  modifiesProjectFiles: boolean;
};

export type ToolDependencyInstallPlan = {
  dependencyId: string;
  sourceId: string;
  safety: ToolDependencySourceSafety;
  target: ToolDependencyInstallTarget;
  packageManager: ToolDependencyPackageManager;
  managedRoot?: string;
  binDir?: string;
  steps: readonly ToolDependencyInstallStep[];
  postInstallProbe: ToolDependencyProbeCommand;
  approvalRequired: boolean;
  approvalReason?: string;
  audit: {
    event: "agentCore.basicToolLayer.toolDependency.source.installPlan";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ToolDependencySourceEntry = {
  dependencyId: string;
  sourceId: string;
  displayName: string;
  safety: ToolDependencySourceSafety;
  packageManager: ToolDependencyPackageManager;
  packageName?: string;
  executableName: string;
  alternateExecutableNames?: readonly string[];
  versionCommand?: ToolDependencyProbeCommand;
  managedInstall?: {
    command: string;
    args: readonly string[];
    env?: Readonly<Record<string, string>>;
  };
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencySourceLookupResult =
  | {
      ok: true;
      source: ToolDependencySourceEntry;
    }
  | {
      ok: false;
      error: {
        code: "DEPENDENCY_SOURCE_NOT_FOUND";
        message: string;
        publicSafe: true;
      };
    };

export type ToolDependencyInstallPlanRequest = {
  dependencyId: string;
  target?: ToolDependencyInstallTarget;
  managedRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
  projectRoot?: string;
  source?: ToolDependencySourceEntry;
};

export type ToolDependencyInstallPlanResult =
  | {
      ok: true;
      plan: ToolDependencyInstallPlan;
    }
  | {
      ok: false;
      error: {
        code: "DEPENDENCY_SOURCE_NOT_FOUND" | "INSTALL_TARGET_NOT_ALLOWED" | "INSTALL_RECIPE_UNAVAILABLE";
        message: string;
        publicSafe: true;
      };
    };

export const dependencySourceRegistryDescriptor = {
  layer: "agent_executionEngine.basic_toolLayer.toolDependency",
  capability: "dependency-source-registry",
  defaultInstallTarget: "praxis-managed",
  tapBypassForTrustedManaged: true,
} as const;

export const builtinDependencySources = [
  {
    dependencyId: "runtime.binary.rg",
    sourceId: "detect:rg",
    displayName: "ripgrep",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "rg",
    versionCommand: { command: "rg", args: ["--version"] },
  },
  {
    dependencyId: "binary:bwrap",
    sourceId: "system:binary:bwrap",
    displayName: "bubblewrap",
    safety: "system-global",
    packageManager: "manual",
    executableName: "bwrap",
    alternateExecutableNames: ["bubblewrap"],
    versionCommand: { command: "bwrap", args: ["--version"] },
  },
  {
    dependencyId: "runtime.binary.ffmpeg",
    sourceId: "detect:ffmpeg",
    displayName: "FFmpeg",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "ffmpeg",
    versionCommand: { command: "ffmpeg", args: ["-version"] },
  },
  {
    dependencyId: "runtime.binary.imagemagick",
    sourceId: "detect:imagemagick",
    displayName: "ImageMagick",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "magick",
    alternateExecutableNames: ["convert"],
    versionCommand: { command: "magick", args: ["--version"] },
  },
  {
    dependencyId: "runtime.binary.xdotool",
    sourceId: "detect:xdotool",
    displayName: "xdotool",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "xdotool",
    versionCommand: { command: "xdotool", args: ["--version"] },
  },
  {
    dependencyId: "runtime.binary.ydotool",
    sourceId: "detect:ydotool",
    displayName: "ydotool",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "ydotool",
    versionCommand: { command: "ydotool", args: ["--version"] },
  },
  {
    dependencyId: "mcp.testServer.echo",
    sourceId: "builtin:mcp-test-server:echo",
    displayName: "Praxis MCP echo test server",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "node",
    versionCommand: { command: "node", args: ["--version"] },
    metadata: {
      provider: "praxis",
      purpose: "repeatable local MCP smoke",
    },
  },
  {
    dependencyId: "lsp.server.typescript-language-server",
    sourceId: "npm:typescript-language-server",
    displayName: "TypeScript Language Server",
    safety: "trusted-managed",
    packageManager: "npm",
    packageName: "typescript-language-server",
    executableName: "typescript-language-server",
    versionCommand: { command: "typescript-language-server", args: ["--version"] },
    managedInstall: {
      command: "npm",
      args: ["install", "--prefix", "{managedRoot}", "typescript-language-server", "typescript"],
    },
  },
  {
    dependencyId: "lsp.server.pyright-langserver",
    sourceId: "npm:pyright",
    displayName: "Pyright Language Server",
    safety: "trusted-managed",
    packageManager: "npm",
    packageName: "pyright",
    executableName: "pyright-langserver",
    alternateExecutableNames: ["pyright"],
    versionCommand: { command: "pyright-langserver", args: ["--version"] },
    managedInstall: {
      command: "npm",
      args: ["install", "--prefix", "{managedRoot}", "pyright"],
    },
  },
  {
    dependencyId: "lsp.server.csharp-ls",
    sourceId: "dotnet-tool:csharp-ls",
    displayName: "C# Language Server",
    safety: "trusted-managed",
    packageManager: "dotnet-tool",
    packageName: "csharp-ls",
    executableName: "csharp-ls",
    versionCommand: { command: "csharp-ls", args: ["--version"] },
    managedInstall: {
      command: "dotnet",
      args: ["tool", "install", "csharp-ls", "--tool-path", "{binDir}"],
    },
  },
  {
    dependencyId: "lsp.server.gopls",
    sourceId: "go-install:gopls",
    displayName: "Go language server",
    safety: "trusted-managed",
    packageManager: "go-install",
    packageName: "golang.org/x/tools/gopls@latest",
    executableName: "gopls",
    versionCommand: { command: "gopls", args: ["version"] },
    managedInstall: {
      command: "go",
      args: ["install", "golang.org/x/tools/gopls@latest"],
      env: { GOBIN: "{binDir}" },
    },
  },
  {
    dependencyId: "lsp.server.clangd",
    sourceId: "detect:clangd",
    displayName: "Clangd",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "clangd",
    versionCommand: { command: "clangd", args: ["--version"] },
  },
  {
    dependencyId: "lsp.server.rust-analyzer",
    sourceId: "detect:rust-analyzer",
    displayName: "Rust Analyzer",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "rust-analyzer",
    versionCommand: { command: "rust-analyzer", args: ["--version"] },
  },
  {
    dependencyId: "lsp.server.jdtls",
    sourceId: "manual:jdtls",
    displayName: "Eclipse JDT Language Server",
    safety: "trusted-detect-only",
    packageManager: "manual",
    executableName: "jdtls",
    versionCommand: { command: "jdtls", args: ["--version"] },
  },
  {
    dependencyId: "lsp.server.kotlin-language-server",
    sourceId: "manual:kotlin-language-server",
    displayName: "Kotlin Language Server",
    safety: "trusted-detect-only",
    packageManager: "manual",
    executableName: "kotlin-language-server",
    versionCommand: { command: "kotlin-language-server", args: ["--version"] },
  },
  {
    dependencyId: "lsp.server.sourcekit-lsp",
    sourceId: "detect:sourcekit-lsp",
    displayName: "SourceKit LSP",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "sourcekit-lsp",
    versionCommand: { command: "sourcekit-lsp", args: ["--version"] },
  },
  {
    dependencyId: "lsp.server.intelephense",
    sourceId: "npm:intelephense",
    displayName: "Intelephense",
    safety: "trusted-managed",
    packageManager: "npm",
    packageName: "intelephense",
    executableName: "intelephense",
    versionCommand: { command: "intelephense", args: ["--version"] },
    managedInstall: {
      command: "npm",
      args: ["install", "--prefix", "{managedRoot}", "intelephense"],
    },
  },
  {
    dependencyId: "lsp.server.bash-language-server",
    sourceId: "npm:bash-language-server",
    displayName: "Bash Language Server",
    safety: "trusted-managed",
    packageManager: "npm",
    packageName: "bash-language-server",
    executableName: "bash-language-server",
    versionCommand: { command: "bash-language-server", args: ["--version"] },
    managedInstall: {
      command: "npm",
      args: ["install", "--prefix", "{managedRoot}", "bash-language-server"],
    },
  },
  {
    dependencyId: "lsp.server.yaml-language-server",
    sourceId: "npm:yaml-language-server",
    displayName: "YAML Language Server",
    safety: "trusted-managed",
    packageManager: "npm",
    packageName: "yaml-language-server",
    executableName: "yaml-language-server",
    versionCommand: { command: "yaml-language-server", args: ["--version"] },
    managedInstall: {
      command: "npm",
      args: ["install", "--prefix", "{managedRoot}", "yaml-language-server"],
    },
  },
  {
    dependencyId: "lsp.server.marksman",
    sourceId: "detect:marksman",
    displayName: "Marksman",
    safety: "trusted-detect-only",
    packageManager: "detect-only",
    executableName: "marksman",
    versionCommand: { command: "marksman", args: ["--version"] },
  },
] as const satisfies readonly ToolDependencySourceEntry[];

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function managedRootFrom(request: Pick<ToolDependencyInstallPlanRequest, "env" | "homeDir">): string {
  const explicit = request.env?.PRAXIS_TOOL_DEPS_HOME?.trim();
  if (!isBlank(explicit)) {
    return explicit ?? "";
  }

  const xdgCache = request.env?.XDG_CACHE_HOME?.trim();
  if (!isBlank(xdgCache)) {
    return path.join(xdgCache ?? "", "praxis", "tool-deps");
  }

  return path.join(request.homeDir?.trim() || os.homedir(), ".cache", "praxis", "tool-deps");
}

function replaceTokens(value: string, replacements: Readonly<Record<string, string>>): string {
  return value.replace(/\{(\w+)\}/gu, (_match, key: string) => replacements[key] ?? "");
}

function replacementMap(managedRoot: string, binDir: string): Readonly<Record<string, string>> {
  return {
    managedRoot,
    binDir,
  };
}

function approvalFor(source: ToolDependencySourceEntry, target: ToolDependencyInstallTarget): { required: boolean; reason?: string } {
  if (target === "system-global") {
    return { required: true, reason: "system-global dependency installation requires governance confirmation" };
  }

  if (source.safety === "custom-source") {
    return { required: true, reason: "custom dependency source requires governance confirmation" };
  }

  if (source.safety === "system-global") {
    return { required: true, reason: "system-global dependency source requires governance confirmation" };
  }

  if (source.safety === "trusted-detect-only") {
    return { required: true, reason: "dependency source is detect-only and does not support automatic managed install" };
  }

  return { required: false };
}

export function lookupDependencySource(dependencyId: string): ToolDependencySourceLookupResult {
  const normalized = dependencyId.trim();
  const source = builtinDependencySources.find((entry) => entry.dependencyId === normalized);
  if (source === undefined) {
    return {
      ok: false,
      error: {
        code: "DEPENDENCY_SOURCE_NOT_FOUND",
        message: `dependency source ${normalized} is not registered`,
        publicSafe: true,
      },
    };
  }

  return { ok: true, source };
}

export function managedBinDir(request: Pick<ToolDependencyInstallPlanRequest, "env" | "homeDir" | "managedRoot">): string {
  return path.join(request.managedRoot?.trim() || managedRootFrom(request), "bin");
}

export function planDependencyInstallation(request: ToolDependencyInstallPlanRequest): ToolDependencyInstallPlanResult {
  const sourceLookup = request.source !== undefined ? { ok: true as const, source: request.source } : lookupDependencySource(request.dependencyId);
  if (!sourceLookup.ok) {
    return sourceLookup;
  }

  const source = sourceLookup.source;
  const target = request.target ?? "praxis-managed";
  const managedRoot = request.managedRoot?.trim() || managedRootFrom(request);
  const binDir = managedBinDir({ ...request, managedRoot });
  const approval = approvalFor(source, target);

  if (target !== "praxis-managed" && source.safety === "trusted-managed") {
    return {
      ok: false,
      error: {
        code: "INSTALL_TARGET_NOT_ALLOWED",
        message: `${source.dependencyId} only supports praxis-managed installation by default`,
        publicSafe: true,
      },
    };
  }

  if (source.managedInstall === undefined) {
    return {
      ok: false,
      error: {
        code: "INSTALL_RECIPE_UNAVAILABLE",
        message: `${source.dependencyId} does not have an automatic managed install recipe`,
        publicSafe: true,
      },
    };
  }

  const replacements = replacementMap(managedRoot, binDir);
  const step: ToolDependencyInstallStep = {
    stepId: `${source.dependencyId}:install`,
    command: replaceTokens(source.managedInstall.command, replacements),
    args: source.managedInstall.args.map((arg) => replaceTokens(arg, replacements)),
    env: Object.fromEntries(
      Object.entries(source.managedInstall.env ?? {}).map(([key, value]) => [key, replaceTokens(value, replacements)]),
    ),
    writesTo: [managedRoot],
    requiresSudo: false,
    modifiesUserShell: false,
    modifiesProjectFiles: false,
  };

  return {
    ok: true,
    plan: {
      dependencyId: source.dependencyId,
      sourceId: source.sourceId,
      safety: source.safety,
      target,
      packageManager: source.packageManager,
      managedRoot,
      binDir,
      steps: [step],
      postInstallProbe: source.versionCommand ?? { command: source.executableName, args: ["--version"] },
      approvalRequired: approval.required,
      approvalReason: approval.reason,
      audit: {
        event: "agentCore.basicToolLayer.toolDependency.source.installPlan",
        metadata: {
          sourceId: source.sourceId,
          displayName: source.displayName,
          safety: source.safety,
        },
      },
    },
  };
}
