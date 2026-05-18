import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { renameLspSymbol } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_renameSymbol.js";
import { fakeLspServerSource } from "./fakeLspServer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_renameSymbol.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_renameSymbol.md",
  testFileUrl: import.meta.url,
});

test("renameLspSymbol creates a dry-run workspace edit plan and applies no changes", async () => {
  const result = await renameLspSymbol({
    target: { filePath: "src/service.ts", line: 4, character: 2 },
    newName: "renamedService",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.renameSymbol");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.appliedChanges, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.workspaceEdit.changes[0]?.newText, "renamedService");
  assert.deepEqual(result.output.permissionsRequired, ["workspace:read", "lsp:read", "workspace:edit", "lsp:rename"]);
});

test("renameLspSymbol rejects missing names and real apply requests", async () => {
  const missingName = await renameLspSymbol({
    target: { filePath: "src/service.ts", line: 4, character: 2 },
    newName: " ",
  });

  assert.equal(missingName.ok, false);
  if (!missingName.ok) {
    assert.equal(missingName.error.code, "MISSING_NEW_NAME");
    assert.equal(missingName.error.boundary, "input");
  }

  const applyRequest = await renameLspSymbol({
    target: { filePath: "src/service.ts", line: 4, character: 2 },
    newName: "renamedService",
    applyChanges: true,
  });

  assert.equal(applyRequest.ok, false);
  if (!applyRequest.ok) {
    assert.equal(applyRequest.error.code, "DANGEROUS_SIDE_EFFECT_BLOCKED");
    assert.equal(applyRequest.error.boundary, "governance");
  }
});

test("renameLspSymbol calls an injected provider for preview edits when dryRun is disabled", async () => {
  const result = await renameLspSymbol({
    target: { filePath: "src/service.ts", line: 4, character: 2 },
    newName: "renamedService",
    context: { dryRun: false },
    provider: (target, newName) => ({
      source: "provider",
      changes: [
        {
          filePath: target.filePath,
          range: {
            start: { line: target.line, character: target.character },
            end: { line: target.line, character: target.character + 7 },
          },
          newText: newName,
        },
      ],
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.appliedChanges, false);
  assert.equal(result.output.workspaceEdit.source, "provider");
  assert.equal(Object.isFrozen(result.output.workspaceEdit.changes), true);
});

test("renameLspSymbol can use the built-in stdio LSP runtime for preview edits", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-rename-"));
  const targetPath = path.join(workspaceRoot, "service.fake");
  await writeFile(targetPath, "const service = 1;\n", "utf8");

  try {
    const result = await renameLspSymbol({
      target: { filePath: targetPath, line: 0, character: 6, languageId: "fake" },
      newName: "renamed",
      context: { dryRun: false, workspaceRoot },
      runtime: {
        workspaceRoot,
        server: {
          command: process.execPath,
          args: [
            "-e",
            fakeLspServerSource({
              "textDocument/rename": {
                changes: {
                  [`file://${targetPath}`]: [
                    {
                      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
                      newText: "renamed",
                    },
                  ],
                },
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
      assert.equal(result.output.workspaceEdit.changes[0]?.filePath, targetPath);
      assert.equal(result.output.workspaceEdit.changes[0]?.newText, "renamed");
      assert.equal(result.output.appliedChanges, false);
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
