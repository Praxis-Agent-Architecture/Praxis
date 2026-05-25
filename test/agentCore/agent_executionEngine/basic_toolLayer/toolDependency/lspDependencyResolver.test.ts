import { defineAgentCoreContractTest } from "../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  declarationsFromLspProfile,
  resolveLspDependency,
} from "../../../../../src/executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/toolDependency/lspDependencyResolver.md",
  testFileUrl: import.meta.url,
});

test("resolveLspDependency resolves mainstream languages from file extension and workspace markers", () => {
  const cases = [
    ["src/app.ts", "typescript", "dependency.lsp.typescriptLanguageServer"],
    ["Program.cs", "csharp", "dependency.lsp.csharpLs"],
    ["src/Main.java", "java", "dependency.lsp.jdtls"],
    ["native/main.cpp", "cpp", "dependency.lsp.clangd"],
    ["Package.swift", "swift", "dependency.lsp.sourcekitLsp"],
    ["build.gradle.kts", "kotlin", "dependency.lsp.kotlinLanguageServer"],
    ["main.py", "python", "dependency.lsp.pyrightLangserver"],
    ["src/lib.rs", "rust", "dependency.lsp.rustAnalyzer"],
    ["main.go", "go", "dependency.lsp.gopls"],
  ] as const;

  for (const [filePath, languageId, dependencyId] of cases) {
    const result = resolveLspDependency({
      target: { filePath },
      workspaceFacts: { markerFiles: ["tsconfig.json", "Program.csproj", "pom.xml", "Package.swift"] },
    });

    assert.equal(result.ok, true, filePath);
    if (result.ok) {
      assert.equal(result.profile.languageId, languageId);
      assert.equal(result.profile.dependencyId, dependencyId);
    }
  }
});

test("resolveLspDependency lets explicit languageId override extension", () => {
  const result = resolveLspDependency({
    target: { filePath: "script.txt", languageId: "python" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.profile.languageId, "python");
  assert.equal(result.profile.confidence, "explicit");
});

test("declarationsFromLspProfile converts the profile into dependencyManager input", () => {
  const result = resolveLspDependency({
    target: { filePath: "src/app.ts" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const declarations = declarationsFromLspProfile(result.profile);
  assert.equal(declarations[0]?.dependencyId, "dependency.lsp.typescriptLanguageServer");
  assert.equal(declarations[0]?.metadata?.lspProfile !== undefined, true);
  assert.equal(declarations[0]?.metadata?.dependencySource !== undefined, true);
  assert.deepEqual((declarations[0]?.metadata?.lspProfile as { serverArgs?: readonly string[] }).serverArgs, ["--stdio"]);
});

test("declarationsFromLspProfile preserves non-npm LSP dependency kinds", () => {
  const result = resolveLspDependency({
    target: { filePath: "Program.cs" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const declarations = declarationsFromLspProfile(result.profile);
  assert.equal(declarations[0]?.dependencyId, "dependency.lsp.csharpLs");
  assert.equal(declarations[0]?.kind, "dotnet-tool");
});

test("resolveLspDependency returns public-safe errors for missing or unknown targets", () => {
  const missing = resolveLspDependency();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_TARGET");
    assert.equal(missing.error.publicSafe, true);
  }

  const unknown = resolveLspDependency({ target: { filePath: "README.unknown" } });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.error.code, "UNRESOLVED_LSP_LANGUAGE");
  }
});
