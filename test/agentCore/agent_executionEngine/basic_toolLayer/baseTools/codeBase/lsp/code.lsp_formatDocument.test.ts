import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createLspFormatDocumentPlan } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_formatDocument.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_formatDocument.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_formatDocument.md",
  testFileUrl: import.meta.url,
});

test("code.lsp_formatDocument creates a dry-run formatting envelope", () => {
  const result = createLspFormatDocumentPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    documentUri: "file:///workspace/src/example.ts",
    languageId: "typescript",
    options: { tabSize: 4, insertSpaces: true },
    requestedScopes: ["workspace:read", "lsp:format"],
    allowedScopes: ["workspace:read", "lsp:format"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.tool, "code.lsp_formatDocument");
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.lspServerInvoked, false);
  assert.equal(result.plan.execution.fileMutationPlanned, false);
  assert.deepEqual(result.plan.acceptedScopes, ["workspace:read", "lsp:format"]);
});

test("code.lsp_formatDocument rejects real LSP execution in the first round", () => {
  const result = createLspFormatDocumentPlan({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    documentUri: "file:///workspace/src/example.ts",
    dryRun: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "REAL_LSP_CALL_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
});
