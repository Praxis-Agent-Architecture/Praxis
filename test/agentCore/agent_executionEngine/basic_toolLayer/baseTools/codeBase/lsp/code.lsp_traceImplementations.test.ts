import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { traceLspImplementations } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_traceImplementations.js";
import { fakeLspServerSource } from "./fakeLspServer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_traceImplementations.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_traceImplementations.md",
  testFileUrl: import.meta.url,
});

test("traceLspImplementations returns a dry-run implementation envelope", async () => {
  const result = await traceLspImplementations({
    target: { filePath: "src/service.ts", line: 4, character: 8, languageId: "typescript" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.traceImplementations");
  assert.equal(result.output.target.languageId, "typescript");
  assert.equal(result.output.implementations[0]?.source, "dry-run");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
});

test("traceLspImplementations rejects targets outside allowed file scope", async () => {
  let providerCalled = false;

  const result = await traceLspImplementations({
    target: { filePath: "src/other.ts", line: 1, character: 1 },
    context: { dryRun: false, allowedFilePaths: ["src/service.ts"] },
    provider: () => {
      providerCalled = true;
      return [];
    },
  });

  assert.equal(result.ok, false);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    assert.equal(result.error.code, "SCOPE_REJECTED");
    assert.equal(result.error.boundary, "scope");
  }
});

test("traceLspImplementations can call an injected provider when dry-run is disabled", async () => {
  const result = await traceLspImplementations({
    target: { filePath: "src/service.ts", line: 4, character: 8 },
    context: { dryRun: false, invocationId: "implementations-1" },
    provider: () => [
      {
        filePath: "src/service.impl.ts",
        range: {
          start: { line: 20, character: 0 },
          end: { line: 20, character: 12 },
        },
        symbolName: "ServiceImpl",
        source: "provider",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.implementations[0]?.symbolName, "ServiceImpl");
  assert.equal(result.audit[0]?.invocationId, "implementations-1");
});

test("traceLspImplementations can use the built-in stdio LSP runtime", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-implementations-"));
  const targetPath = path.join(workspaceRoot, "service.fake");
  await writeFile(targetPath, "interface Service {}\n", "utf8");

  try {
    const result = await traceLspImplementations({
      target: { filePath: targetPath, line: 0, character: 10, languageId: "fake" },
      context: { dryRun: false, workspaceRoot },
      runtime: {
        workspaceRoot,
        server: {
          command: process.execPath,
          args: [
            "-e",
            fakeLspServerSource({
              "textDocument/implementation": {
                uri: `file://${targetPath}`,
                range: { start: { line: 0, character: 10 }, end: { line: 0, character: 17 } },
              },
            }),
          ],
          languageId: "fake",
          fileExtensions: [".fake"],
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.implementations[0]?.filePath, targetPath);
      assert.equal(result.output.providerCalled, true);
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
