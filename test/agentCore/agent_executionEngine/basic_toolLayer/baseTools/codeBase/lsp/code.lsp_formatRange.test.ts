import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createLspFormatRangePlan } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_formatRange.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_formatRange.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_formatRange.md",
  testFileUrl: import.meta.url,
});

test("code.lsp_formatRange creates a range-scoped dry-run formatting envelope", () => {
  const result = createLspFormatRangePlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    documentUri: "file:///workspace/src/example.ts",
    range: {
      start: { line: 1, character: 0 },
      end: { line: 3, character: 12 },
    },
    options: { tabSize: 2 },
    requestedScopes: ["workspace:read"],
    allowedScopes: ["workspace:read"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.tool, "code.lsp_formatRange");
  assert.deepEqual(result.plan.range.start, { line: 1, character: 0 });
  assert.equal(result.plan.execution.lspServerInvoked, false);
  assert.equal(result.plan.execution.fileMutationPlanned, false);
});

test("code.lsp_formatRange rejects inverted ranges", () => {
  const result = createLspFormatRangePlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    documentUri: "file:///workspace/src/example.ts",
    range: {
      start: { line: 4, character: 0 },
      end: { line: 3, character: 12 },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_RANGE");
  assert.equal(result.error.boundary, "input");
});
