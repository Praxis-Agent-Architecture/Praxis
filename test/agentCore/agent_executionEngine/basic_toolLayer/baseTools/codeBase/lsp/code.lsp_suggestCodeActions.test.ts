import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { suggestLspCodeActions } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_suggestCodeActions.js";
import { fakeLspServerSource } from "./fakeLspServer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_suggestCodeActions.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_suggestCodeActions.md",
  testFileUrl: import.meta.url,
});

test("suggestLspCodeActions returns a dry-run action suggestion envelope", async () => {
  const result = await suggestLspCodeActions({
    target: {
      filePath: "src/runtime.ts",
      range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } },
      languageId: "typescript",
    },
    diagnostics: [{ message: "missing return type", severity: "hint" }],
    only: ["quickfix"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.suggestCodeActions");
  assert.equal(result.output.target.filePath, "src/runtime.ts");
  assert.deepEqual(result.output.only, ["quickfix"]);
  assert.equal(result.output.diagnostics[0]?.message, "missing return type");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.appliesChanges, false);
});

test("suggestLspCodeActions respects scope guard before provider dispatch", async () => {
  let providerCalled = false;

  const result = await suggestLspCodeActions({
    target: {
      filePath: "src/runtime.ts",
      range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } },
    },
    context: { dryRun: false, guard: { allowed: false, reason: "approval missing" } },
    provider: () => {
      providerCalled = true;
      return [];
    },
  });

  assert.equal(result.ok, false);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    assert.equal(result.error.code, "GOVERNANCE_REJECTED");
    assert.equal(result.error.boundary, "governance");
  }
});

test("suggestLspCodeActions can call an injected provider without applying edits", async () => {
  const result = await suggestLspCodeActions({
    target: {
      filePath: "src/runtime.ts",
      range: { start: { line: 2, character: 0 }, end: { line: 2, character: 10 } },
    },
    context: { dryRun: false, invocationId: "code-actions-1" },
    provider: () => [
      {
        title: "Add explicit return type",
        kind: "quickfix",
        editAvailable: true,
        commandAvailable: false,
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.appliesChanges, false);
  assert.equal(result.output.actions[0]?.title, "Add explicit return type");
  assert.equal(result.output.actions[0]?.source, "provider");
  assert.equal(result.audit[0]?.invocationId, "code-actions-1");
});

test("suggestLspCodeActions can use the built-in stdio LSP runtime", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-code-action-"));
  const targetPath = path.join(workspaceRoot, "runtime.fake");
  await writeFile(targetPath, "const value = 1;\n", "utf8");

  try {
    const result = await suggestLspCodeActions({
      target: {
        filePath: targetPath,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        languageId: "fake",
      },
      context: { dryRun: false, workspaceRoot },
      runtime: {
        workspaceRoot,
        server: {
          command: process.execPath,
          args: [
            "-e",
            fakeLspServerSource({
              "textDocument/codeAction": [
                {
                  title: "Extract constant",
                  kind: "refactor.extract",
                  edit: { changes: {} },
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
      assert.equal(result.output.actions[0]?.title, "Extract constant");
      assert.equal(result.output.actions[0]?.editAvailable, true);
      assert.equal(result.output.appliesChanges, false);
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
