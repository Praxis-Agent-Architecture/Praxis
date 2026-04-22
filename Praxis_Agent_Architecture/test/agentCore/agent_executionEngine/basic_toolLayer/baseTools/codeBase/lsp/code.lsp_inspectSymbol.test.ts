import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { inspectLspSymbol } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_inspectSymbol.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_inspectSymbol.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_inspectSymbol.md",
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
