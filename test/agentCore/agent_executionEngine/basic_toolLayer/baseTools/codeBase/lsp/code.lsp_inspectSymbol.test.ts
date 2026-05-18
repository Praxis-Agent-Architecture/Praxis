import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectLspSymbol } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_inspectSymbol.js";
import { lspInspectSymbolHandler } from "../../../../../../../src/storagePool/baseToolStorage/codeBase/lsp/code.lsp_inspectSymbol/bestPractice.js";
import { fakeLspServerSource } from "./fakeLspServer.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_inspectSymbol.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_inspectSymbol.md",
  testFileUrl: import.meta.url,
});

test("code.lsp_inspectSymbol selects a symbol from a supplied snapshot", () => {
  const result = inspectLspSymbol({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    documentUri: "file:///workspace/src/example.ts",
    target: { position: { line: 10, character: 8 } },
    symbols: [
      {
        name: "ExampleService",
        kind: "class",
        range: {
          start: { line: 8, character: 0 },
          end: { line: 20, character: 1 },
        },
        selectionRange: {
          start: { line: 8, character: 13 },
          end: { line: 8, character: 27 },
        },
      },
      {
        name: "run",
        kind: "method",
        range: {
          start: { line: 10, character: 2 },
          end: { line: 12, character: 3 },
        },
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.snapshot.tool, "code.lsp_inspectSymbol");
  assert.equal(result.snapshot.symbol?.name, "ExampleService");
  assert.equal(result.snapshot.candidates.length, 2);
  assert.equal(result.snapshot.execution.lspServerInvoked, false);
});

test("code.lsp_inspectSymbol requires a narrow symbol target", () => {
  const result = inspectLspSymbol({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    documentUri: "file:///workspace/src/example.ts",
    target: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_SYMBOL_TARGET");
  assert.equal(result.error.boundary, "input");
});

test("code.lsp_inspectSymbol uses character position as well as line position", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-inspect-symbol-"));
  const targetPath = path.join(workspaceRoot, "example.fake");
  await writeFile(targetPath, "const alpha = 1;\n", "utf8");

  const runtime = {
    workspaceRoot,
    server: {
      command: process.execPath,
      args: [
        "-e",
        fakeLspServerSource({
          "textDocument/documentSymbol": [
            {
              name: "WrongByCharacter",
              kind: 5,
              range: {
                start: { line: 0, character: 8 },
                end: { line: 0, character: 14 },
              },
            },
            {
              name: "CorrectByCharacter",
              kind: 5,
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 5 },
              },
            },
          ],
        }),
      ],
      languageId: "fake",
      fileExtensions: [".fake"],
    },
  } as const;

  const result = await lspInspectSymbolHandler.invoke({
    toolCallId: "call-1",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      documentUri: targetPath,
      target: {
        position: { line: 0, character: 2 },
      },
      dryRun: false,
      runtime,
    },
    executor: {},
  });

  try {
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }

    assert.equal(result.output.kind, "agentCore.basicTool.lsp.inspectSymbol");
    if (result.output.kind !== "agentCore.basicTool.lsp.inspectSymbol") {
      return;
    }

    assert.equal(result.output.candidates.length, 1);
    assert.equal(result.output.candidates[0]?.name, "CorrectByCharacter");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
