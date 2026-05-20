/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 工具依赖管理层 / LSP 依赖解析器。
 * 核心目的：根据目标文件和 workspace 语言事实判断需要哪个 LSP server。
 * 能力要求1：需要把 target、languageId、扩展名和 workspace markers 解析成稳定依赖画像。
 * 能力要求2：语言支持必须由注册表驱动，避免只写死少数语言。
 * 边界：只解析依赖画像，不探测本机环境，也不执行安装。
 * 对接：输出 ToolDependencyDeclaration 给 dependencyManager、dependencyChecker 和 dependencyIterationManager 使用。
 * 实现提示：显式 languageId 优先，其次文件扩展名，再次 workspace marker，最后内容特征。
 */

import path from "node:path";
import type { ToolDependencyDeclaration } from "./dependencyManager.js";
import { lookupDependencySource, type ToolDependencySourceEntry } from "./dependencySourceRegistry.js";

export type LspLanguageConfidence = "explicit" | "high" | "medium" | "low";

export type LspWorkspaceFacts = {
  markerFiles?: readonly string[];
  fileContentSample?: string;
};

export type LspDependencyResolveRequest = {
  toolId?: string;
  target?: {
    filePath?: string;
    languageId?: string;
  };
  workspaceRoot?: string;
  workspaceFacts?: LspWorkspaceFacts;
};

export type LspDependencyProfile = {
  languageId: string;
  languageName: string;
  dependencyId: string;
  serverCommand: string;
  serverCandidates: readonly string[];
  serverArgs: readonly string[];
  fileExtensions: readonly string[];
  workspaceMarkers: readonly string[];
  confidence: LspLanguageConfidence;
  reasons: readonly string[];
  source?: ToolDependencySourceEntry;
};

export type LspDependencyResolveResult =
  | {
      ok: true;
      profile: LspDependencyProfile;
      events: readonly string[];
    }
  | {
      ok: false;
      error: {
        code: "MISSING_TARGET" | "UNRESOLVED_LSP_LANGUAGE";
        message: string;
        publicSafe: true;
      };
      events: readonly string[];
    };

type LspLanguageProfileRegistryEntry = {
  languageId: string;
  aliases?: readonly string[];
  languageName: string;
  dependencyId: string;
  serverArgs?: readonly string[];
  fileExtensions: readonly string[];
  workspaceMarkers: readonly string[];
  shebangPatterns?: readonly RegExp[];
};

export const lspLanguageProfileRegistry: readonly LspLanguageProfileRegistryEntry[] = [
  {
    languageId: "typescript",
    aliases: ["typescriptreact"],
    languageName: "TypeScript",
    dependencyId: "lsp.server.typescript-language-server",
    serverArgs: ["--stdio"],
    fileExtensions: [".ts", ".tsx", ".mts", ".cts"],
    workspaceMarkers: ["tsconfig.json", "package.json"],
  },
  {
    languageId: "javascript",
    aliases: ["javascriptreact"],
    languageName: "JavaScript",
    dependencyId: "lsp.server.typescript-language-server",
    serverArgs: ["--stdio"],
    fileExtensions: [".js", ".jsx", ".mjs", ".cjs"],
    workspaceMarkers: ["jsconfig.json", "package.json"],
  },
  {
    languageId: "python",
    languageName: "Python",
    dependencyId: "lsp.server.pyright-langserver",
    serverArgs: ["--stdio"],
    fileExtensions: [".py", ".pyi"],
    workspaceMarkers: ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"],
    shebangPatterns: [/python/u],
  },
  {
    languageId: "rust",
    languageName: "Rust",
    dependencyId: "lsp.server.rust-analyzer",
    serverArgs: [],
    fileExtensions: [".rs"],
    workspaceMarkers: ["Cargo.toml"],
  },
  {
    languageId: "go",
    languageName: "Go",
    dependencyId: "lsp.server.gopls",
    serverArgs: [],
    fileExtensions: [".go"],
    workspaceMarkers: ["go.mod", "go.work"],
  },
  {
    languageId: "csharp",
    aliases: ["cs"],
    languageName: "C#",
    dependencyId: "lsp.server.csharp-ls",
    serverArgs: [],
    fileExtensions: [".cs", ".csx"],
    workspaceMarkers: [".sln", ".csproj", "global.json"],
  },
  {
    languageId: "java",
    languageName: "Java",
    dependencyId: "lsp.server.jdtls",
    serverArgs: [],
    fileExtensions: [".java"],
    workspaceMarkers: ["pom.xml", "build.gradle", "build.gradle.kts", ".classpath", ".project"],
  },
  {
    languageId: "cpp",
    aliases: ["c", "cc", "c++"],
    languageName: "C/C++",
    dependencyId: "lsp.server.clangd",
    serverArgs: [],
    fileExtensions: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hxx"],
    workspaceMarkers: ["compile_commands.json", "compile_flags.txt", "CMakeLists.txt"],
  },
  {
    languageId: "kotlin",
    languageName: "Kotlin",
    dependencyId: "lsp.server.kotlin-language-server",
    serverArgs: [],
    fileExtensions: [".kt", ".kts"],
    workspaceMarkers: ["build.gradle.kts", "settings.gradle.kts"],
  },
  {
    languageId: "swift",
    languageName: "Swift",
    dependencyId: "lsp.server.sourcekit-lsp",
    serverArgs: [],
    fileExtensions: [".swift"],
    workspaceMarkers: ["Package.swift"],
  },
  {
    languageId: "php",
    languageName: "PHP",
    dependencyId: "lsp.server.intelephense",
    serverArgs: ["--stdio"],
    fileExtensions: [".php"],
    workspaceMarkers: ["composer.json"],
  },
  {
    languageId: "shellscript",
    aliases: ["bash", "sh", "zsh"],
    languageName: "Shell",
    dependencyId: "lsp.server.bash-language-server",
    serverArgs: ["start"],
    fileExtensions: [".sh", ".bash", ".zsh"],
    workspaceMarkers: [".shellcheckrc"],
    shebangPatterns: [/\b(?:bash|sh|zsh)\b/u],
  },
  {
    languageId: "yaml",
    aliases: ["yml"],
    languageName: "YAML",
    dependencyId: "lsp.server.yaml-language-server",
    serverArgs: ["--stdio"],
    fileExtensions: [".yaml", ".yml"],
    workspaceMarkers: [".yamllint", ".github/workflows"],
  },
  {
    languageId: "markdown",
    aliases: ["md"],
    languageName: "Markdown",
    dependencyId: "lsp.server.marksman",
    serverArgs: ["server"],
    fileExtensions: [".md", ".markdown"],
    workspaceMarkers: [".marksman.toml"],
  },
];

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function markerMatches(marker: string, facts: LspWorkspaceFacts | undefined): boolean {
  const normalizedMarker = marker.toLowerCase();
  return (facts?.markerFiles ?? []).some((fact) => {
    const normalizedFact = fact.trim().toLowerCase();
    return normalizedFact === normalizedMarker || normalizedFact.endsWith(`/${normalizedMarker}`);
  });
}

function sourceFor(dependencyId: string): ToolDependencySourceEntry | undefined {
  const lookup = lookupDependencySource(dependencyId);
  return lookup.ok ? lookup.source : undefined;
}

function buildProfile(
  entry: LspLanguageProfileRegistryEntry,
  confidence: LspLanguageConfidence,
  reasons: readonly string[],
): LspDependencyProfile {
  const source = sourceFor(entry.dependencyId);
  return {
    languageId: entry.languageId,
    languageName: entry.languageName,
    dependencyId: entry.dependencyId,
    serverCommand: source?.executableName ?? entry.dependencyId.replace(/^lsp\.server\./u, ""),
    serverCandidates: [source?.executableName, ...(source?.alternateExecutableNames ?? [])].filter(
      (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
    ),
    serverArgs: entry.serverArgs ?? [],
    fileExtensions: entry.fileExtensions,
    workspaceMarkers: entry.workspaceMarkers,
    confidence,
    reasons,
    source,
  };
}

function matchByLanguageId(languageId: string | undefined): LspLanguageProfileRegistryEntry | undefined {
  const normalized = normalize(languageId);
  if (normalized.length === 0) {
    return undefined;
  }

  return lspLanguageProfileRegistry.find(
    (entry) => entry.languageId === normalized || (entry.aliases ?? []).includes(normalized),
  );
}

function matchByExtension(filePath: string | undefined): LspLanguageProfileRegistryEntry | undefined {
  const extension = path.extname(filePath ?? "").toLowerCase();
  if (extension.length === 0) {
    return undefined;
  }

  return lspLanguageProfileRegistry.find((entry) => entry.fileExtensions.includes(extension));
}

function matchByMarker(facts: LspWorkspaceFacts | undefined): LspLanguageProfileRegistryEntry | undefined {
  return lspLanguageProfileRegistry.find((entry) => entry.workspaceMarkers.some((marker) => markerMatches(marker, facts)));
}

function matchByShebang(facts: LspWorkspaceFacts | undefined): LspLanguageProfileRegistryEntry | undefined {
  const firstLine = facts?.fileContentSample?.split(/\r?\n/u)[0] ?? "";
  if (!firstLine.startsWith("#!")) {
    return undefined;
  }

  return lspLanguageProfileRegistry.find((entry) => (entry.shebangPatterns ?? []).some((pattern) => pattern.test(firstLine)));
}

export function resolveLspDependency(request: LspDependencyResolveRequest = {}): LspDependencyResolveResult {
  if (request.target === undefined || (isBlank(request.target.filePath) && isBlank(request.target.languageId))) {
    return {
      ok: false,
      error: {
        code: "MISSING_TARGET",
        message: "LSP dependency resolution requires target.filePath or target.languageId",
        publicSafe: true,
      },
      events: ["agentCore.basicToolLayer.toolDependency.lspResolver.rejected"],
    };
  }

  const explicit = matchByLanguageId(request.target.languageId);
  if (explicit !== undefined) {
    return {
      ok: true,
      profile: buildProfile(explicit, "explicit", [`languageId ${request.target.languageId?.trim()} matched ${explicit.languageId}`]),
      events: ["agentCore.basicToolLayer.toolDependency.lspResolver.resolved"],
    };
  }

  const byExtension = matchByExtension(request.target.filePath);
  if (byExtension !== undefined) {
    return {
      ok: true,
      profile: buildProfile(byExtension, "high", [`file extension ${path.extname(request.target.filePath ?? "")} matched ${byExtension.languageId}`]),
      events: ["agentCore.basicToolLayer.toolDependency.lspResolver.resolved"],
    };
  }

  const byMarker = matchByMarker(request.workspaceFacts);
  if (byMarker !== undefined) {
    return {
      ok: true,
      profile: buildProfile(byMarker, "medium", [`workspace marker matched ${byMarker.languageId}`]),
      events: ["agentCore.basicToolLayer.toolDependency.lspResolver.resolved"],
    };
  }

  const byShebang = matchByShebang(request.workspaceFacts);
  if (byShebang !== undefined) {
    return {
      ok: true,
      profile: buildProfile(byShebang, "low", [`file shebang matched ${byShebang.languageId}`]),
      events: ["agentCore.basicToolLayer.toolDependency.lspResolver.resolved"],
    };
  }

  return {
    ok: false,
    error: {
      code: "UNRESOLVED_LSP_LANGUAGE",
      message: "Could not resolve an LSP language profile for the target",
      publicSafe: true,
    },
    events: ["agentCore.basicToolLayer.toolDependency.lspResolver.unresolved"],
  };
}

export function declarationsFromLspProfile(profile: LspDependencyProfile): readonly ToolDependencyDeclaration[] {
  return [
    {
      dependencyId: profile.dependencyId,
      kind: profile.source?.packageManager === "detect-only" ? "runtime" : "package",
      displayName: profile.source?.displayName ?? profile.languageName,
      required: true,
      metadata: {
        lspProfile: {
          languageId: profile.languageId,
          languageName: profile.languageName,
          serverCommand: profile.serverCommand,
          serverCandidates: profile.serverCandidates,
          serverArgs: profile.serverArgs,
          confidence: profile.confidence,
          reasons: profile.reasons,
        },
        dependencySource: profile.source,
      },
    },
  ];
}
