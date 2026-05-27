/*
 * Runtime dependency plane / LSP dependency resolver.
 * Purpose: map code intelligence targets to stable dependency declarations.
 */

import {
  dependencyKindFromId,
  type DependencyDeclaration,
  type DependencyKind,
  type DependencyPlaneResult,
} from "./dependencyTypes.js";

export type LspDependencyProfile = {
  languageId: string;
  dependencyId: string;
  serverCommand: string;
  serverArgs: readonly string[];
  dependencyKind: DependencyKind;
  confidence: "explicit" | "extension" | "workspace-marker";
  sourceRef: string;
};

export type LspDependencyResolverInput = {
  target?: {
    filePath?: string;
    languageId?: string;
  };
  workspaceFacts?: {
    markerFiles?: readonly string[];
  };
};

const profiles: Record<string, Omit<LspDependencyProfile, "confidence">> = {
  typescript: {
    languageId: "typescript",
    dependencyId: "dependency.lsp.typescriptLanguageServer",
    dependencyKind: "npm",
    serverCommand: "typescript-language-server",
    serverArgs: ["--stdio"],
    sourceRef: "official:npm:typescript-language-server",
  },
  csharp: {
    languageId: "csharp",
    dependencyId: "dependency.lsp.csharpLs",
    dependencyKind: "dotnet-tool",
    serverCommand: "csharp-ls",
    serverArgs: [],
    sourceRef: "official:dotnet-tool:csharp-ls",
  },
  java: {
    languageId: "java",
    dependencyId: "dependency.lsp.jdtls",
    dependencyKind: "binary",
    serverCommand: "jdtls",
    serverArgs: [],
    sourceRef: "official:detect:jdtls",
  },
  cpp: {
    languageId: "cpp",
    dependencyId: "dependency.lsp.clangd",
    dependencyKind: "binary",
    serverCommand: "clangd",
    serverArgs: [],
    sourceRef: "official:detect:clangd",
  },
  swift: {
    languageId: "swift",
    dependencyId: "dependency.lsp.sourcekitLsp",
    dependencyKind: "binary",
    serverCommand: "sourcekit-lsp",
    serverArgs: [],
    sourceRef: "official:detect:sourcekit-lsp",
  },
  kotlin: {
    languageId: "kotlin",
    dependencyId: "dependency.lsp.kotlinLanguageServer",
    dependencyKind: "binary",
    serverCommand: "kotlin-language-server",
    serverArgs: [],
    sourceRef: "official:detect:kotlin-language-server",
  },
  python: {
    languageId: "python",
    dependencyId: "dependency.lsp.pyrightLangserver",
    dependencyKind: "npm",
    serverCommand: "pyright-langserver",
    serverArgs: ["--stdio"],
    sourceRef: "official:npm:pyright",
  },
  rust: {
    languageId: "rust",
    dependencyId: "dependency.lsp.rustAnalyzer",
    dependencyKind: "binary",
    serverCommand: "rust-analyzer",
    serverArgs: [],
    sourceRef: "official:detect:rust-analyzer",
  },
  go: {
    languageId: "go",
    dependencyId: "dependency.lsp.gopls",
    dependencyKind: "binary",
    serverCommand: "gopls",
    serverArgs: [],
    sourceRef: "official:detect:gopls",
  },
};

function failure<TValue>(code: string, message: string): DependencyPlaneResult<TValue> {
  return {
    ok: false,
    error: { code, message, boundary: "input", publicSafe: true },
    events: ["runtime.dependency.lsp.rejected"],
  };
}

function languageFromPath(filePath: string, markerFiles: readonly string[]): { languageId?: string; confidence: LspDependencyProfile["confidence"] } {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".js") || lower.endsWith(".jsx")) return { languageId: "typescript", confidence: "extension" };
  if (lower.endsWith(".cs")) return { languageId: "csharp", confidence: "extension" };
  if (lower.endsWith(".java")) return { languageId: "java", confidence: "extension" };
  if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".cxx") || lower.endsWith(".hpp")) return { languageId: "cpp", confidence: "extension" };
  if (lower.endsWith(".swift")) return { languageId: "swift", confidence: "extension" };
  if (lower.endsWith(".kt") || lower.endsWith(".kts") || lower.endsWith("build.gradle.kts")) return { languageId: "kotlin", confidence: "extension" };
  if (lower.endsWith(".py")) return { languageId: "python", confidence: "extension" };
  if (lower.endsWith(".rs")) return { languageId: "rust", confidence: "extension" };
  if (lower.endsWith(".go")) return { languageId: "go", confidence: "extension" };
  if (markerFiles.some((item) => item.endsWith(".csproj"))) return { languageId: "csharp", confidence: "workspace-marker" };
  if (markerFiles.includes("pom.xml")) return { languageId: "java", confidence: "workspace-marker" };
  if (markerFiles.includes("Package.swift")) return { languageId: "swift", confidence: "workspace-marker" };
  return { confidence: "extension" };
}

export function resolveLspDependency(input: LspDependencyResolverInput = {}): DependencyPlaneResult<{ profile: LspDependencyProfile }> {
  const target = input.target;
  if (target === undefined || (target.filePath?.trim().length ?? 0) === 0) {
    return failure("MISSING_TARGET", "LSP dependency resolution requires a target file path");
  }
  const explicit = target.languageId?.trim();
  const resolved = explicit === undefined || explicit.length === 0
    ? languageFromPath(target.filePath ?? "", input.workspaceFacts?.markerFiles ?? [])
    : { languageId: explicit, confidence: "explicit" as const };
  if (resolved.languageId === undefined || profiles[resolved.languageId] === undefined) {
    return failure("UNRESOLVED_LSP_LANGUAGE", `could not resolve an LSP dependency for ${target.filePath}`);
  }
  return {
    ok: true,
    value: {
      profile: {
        ...profiles[resolved.languageId],
        confidence: resolved.confidence,
      },
    },
    events: ["runtime.dependency.lsp.resolved"],
  };
}

export function declarationsFromLspProfile(profile?: LspDependencyProfile): readonly DependencyDeclaration[] {
  if (profile === undefined) return [];
  return [{
    dependencyId: profile.dependencyId,
    kind: profile.dependencyKind ?? dependencyKindFromId(profile.dependencyId),
    required: true,
    sourceRef: profile.sourceRef,
    metadata: {
      lspProfile: profile,
      dependencySource: profile.sourceRef,
    },
  }];
}
