import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  lspExplainSymbolDescriptor,
  planLspSymbolExplanation,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_explainSymbol.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_explainSymbol.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_explainSymbol.md",
  testFileUrl: import.meta.url,
});

test("planLspSymbolExplanation creates a guarded symbol explanation plan", () => {
  const result = planLspSymbolExplanation({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    position: { line: 20, character: 7 },
    symbolName: "createRuntime",
    includeDefinitionHint: true,
    includeReferencesHint: true,
    requestedScopes: ["tool:lsp"],
    allowedScopes: ["tool:lsp"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(lspExplainSymbolDescriptor.requiresApproval, false);
  assert.equal(result.plan.toolId, "code.lsp_explainSymbol");
  assert.equal(result.plan.target.symbolName, "createRuntime");
  assert.deepEqual(result.plan.target.position, { line: 20, character: 7 });
  assert.equal(result.plan.explanationHints.includeDefinitionHint, true);
  assert.equal(result.plan.explanationHints.includeReferencesHint, true);
  assert.equal(result.plan.execution.lspInvoked, false);
  assert.equal(result.plan.execution.modelInvoked, false);
  assert.equal(result.plan.execution.documentMutated, false);
});

test("planLspSymbolExplanation requires a position or symbol name target", () => {
  const result = planLspSymbolExplanation({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("missing symbol target must be rejected");
  }

  assert.equal(result.error.code, "MISSING_SYMBOL_TARGET");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("planLspSymbolExplanation rejects scopes outside runtime governance", () => {
  const result = planLspSymbolExplanation({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    symbolName: "createRuntime",
    requestedScopes: ["workspace:write"],
    allowedScopes: ["tool:lsp"],
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("scope escape must be rejected");
  }

  assert.equal(result.error.code, "SCOPE_DENIED");
  assert.equal(result.error.boundary, "scope");
  assert.deepEqual(result.events, ["basicTool.lsp.explainSymbol.rejected"]);
});
