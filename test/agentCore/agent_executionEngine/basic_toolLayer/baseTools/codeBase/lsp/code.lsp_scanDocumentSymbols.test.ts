import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { scanLspDocumentSymbols } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_scanDocumentSymbols.js";
import { fakeLspServerSource } from "./fakeLspServer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_scanDocumentSymbols.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_scanDocumentSymbols.md",
  testFileUrl: import.meta.url,
});

test("scanLspDocumentSymbols returns an empty dry-run symbol list by default", async () => {
  const result = await scanLspDocumentSymbols({
    target: { filePath: "src/controller.ts", languageId: "typescript" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.scanDocumentSymbols");
  assert.equal(result.output.target.languageId, "typescript");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.symbols.length, 0);
  assert.equal(Object.isFrozen(result.output.symbols), true);
});

test("scanLspDocumentSymbols classifies missing file and scope violations", async () => {
  const missing = await scanLspDocumentSymbols();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_FILE_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const scoped = await scanLspDocumentSymbols({
    target: { filePath: "src/outside.ts" },
    context: { allowedFilePaths: ["src/inside.ts"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
    assert.equal(scoped.error.boundary, "scope");
  }
});

test("scanLspDocumentSymbols uses a mockable provider when dryRun is disabled", async () => {
  const result = await scanLspDocumentSymbols({
    target: { filePath: "src/controller.ts" },
    context: { dryRun: false, invocationId: "symbols-1" },
    provider: () => [
      {
        name: "Controller",
        kind: "class",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 1 },
        },
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.symbols[0]?.name, "Controller");
  assert.equal(result.audit[0]?.invocationId, "symbols-1");
});

test("scanLspDocumentSymbols maps provider failures to a public-safe stable message", async () => {
  const result = await scanLspDocumentSymbols({
    target: { filePath: "src/controller.ts" },
    context: { dryRun: false, invocationId: "symbols-failure" },
    provider: () => {
      throw new Error("secret /home/proview/private/path");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.message, "code.lsp_scanDocumentSymbols provider rejected the invocation");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.doesNotMatch(result.error.message, /secret|\/home\/proview/u);
  }
});

test("scanLspDocumentSymbols can use the built-in stdio LSP runtime", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-symbols-"));
  const targetPath = path.join(workspaceRoot, "controller.fake");
  await writeFile(targetPath, "class Controller {}\n", "utf8");

  try {
    const result = await scanLspDocumentSymbols({
      target: { filePath: targetPath, languageId: "fake" },
      context: { dryRun: false, workspaceRoot },
      runtime: {
        workspaceRoot,
        server: {
          command: process.execPath,
          args: [
            "-e",
            fakeLspServerSource({
              "textDocument/documentSymbol": [
                {
                  name: "Controller",
                  kind: 5,
                  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 19 } },
                  selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 16 } },
                },
              ],
            }),
          ],
          languageId: "fake",
          fileExtensions: [".fake"],
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.symbols[0]?.name, "Controller");
      assert.equal(result.output.providerCalled, true);
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
