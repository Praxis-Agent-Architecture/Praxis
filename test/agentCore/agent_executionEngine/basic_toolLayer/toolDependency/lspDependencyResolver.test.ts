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
    ["src/app.ts", "typescript", "lsp.server.typescript-language-server"],
    ["Program.cs", "csharp", "lsp.server.csharp-ls"],
    ["src/Main.java", "java", "lsp.server.jdtls"],
    ["native/main.cpp", "cpp", "lsp.server.clangd"],
    ["Package.swift", "swift", "lsp.server.sourcekit-lsp"],
    ["build.gradle.kts", "kotlin", "lsp.server.kotlin-language-server"],
    ["main.py", "python", "lsp.server.pyright-langserver"],
    ["src/lib.rs", "rust", "lsp.server.rust-analyzer"],
    ["main.go", "go", "lsp.server.gopls"],
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
  assert.equal(declarations[0]?.dependencyId, "lsp.server.typescript-language-server");
  assert.equal(declarations[0]?.metadata?.lspProfile !== undefined, true);
  assert.equal(declarations[0]?.metadata?.dependencySource !== undefined, true);
  assert.deepEqual((declarations[0]?.metadata?.lspProfile as { serverArgs?: readonly string[] }).serverArgs, ["--stdio"]);
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
