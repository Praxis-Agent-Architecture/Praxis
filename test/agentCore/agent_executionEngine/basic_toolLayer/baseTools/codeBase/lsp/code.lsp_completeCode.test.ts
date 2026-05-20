import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  lspCompleteCodeDescriptor,
  planLspCodeCompletion,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_completeCode.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_completeCode.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_completeCode.md",
  testFileUrl: import.meta.url,
});

test("planLspCodeCompletion creates a read-only semantic completion plan", () => {
  const result = planLspCodeCompletion({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    position: { line: 8, character: 14 },
    triggerCharacter: ".",
    prefix: "runtime.",
    maxItems: 25,
    requestedScopes: ["tool:lsp"],
    allowedScopes: ["tool:lsp"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(lspCompleteCodeDescriptor.sideEffectPolicy, "dry-run-only");
  assert.equal(result.plan.toolId, "code.lsp_completeCode");
  assert.deepEqual(result.plan.position, { line: 8, character: 14 });
  assert.equal(result.plan.completionContext.prefix, "runtime.");
  assert.equal(result.plan.completionContext.maxItems, 25);
  assert.equal(result.plan.execution.lspInvoked, false);
  assert.equal(result.plan.execution.completionApplied, false);
});

test("planLspCodeCompletion rejects invalid completion limits", () => {
  const result = planLspCodeCompletion({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    position: { line: 8, character: 14 },
    maxItems: 0,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("invalid maxItems must be rejected");
  }

  assert.equal(result.error.code, "INVALID_MAX_ITEMS");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("planLspCodeCompletion blocks live completion execution", () => {
  const result = planLspCodeCompletion({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    position: { line: 8, character: 14 },
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("live completion execution must be blocked");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
});
