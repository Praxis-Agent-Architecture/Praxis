import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  lspAssistSignatureDescriptor,
  planLspSignatureAssistance,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_assistSignature.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_assistSignature.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_assistSignature.md",
  testFileUrl: import.meta.url,
});

test("planLspSignatureAssistance creates a read-only signature assistance plan", () => {
  const result = planLspSignatureAssistance({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    position: { line: 12, character: 20 },
    triggerCharacter: "(",
    callExpressionHint: "createRuntime(",
    requestedScopes: ["tool:lsp"],
    allowedScopes: ["tool:lsp"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(lspAssistSignatureDescriptor.requiresApproval, false);
  assert.equal(result.plan.toolId, "code.lsp_assistSignature");
  assert.deepEqual(result.plan.position, { line: 12, character: 20 });
  assert.equal(result.plan.signatureContext.triggerCharacter, "(");
  assert.equal(result.plan.execution.lspInvoked, false);
  assert.equal(result.plan.execution.documentMutated, false);
  assert.equal(result.plan.permissions.approvalRequired, false);
});

test("planLspSignatureAssistance rejects invalid positions", () => {
  const result = planLspSignatureAssistance({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    position: { line: -1, character: 0 },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("invalid position must be rejected");
  }

  assert.equal(result.error.code, "INVALID_POSITION");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("planLspSignatureAssistance preserves governance denial", () => {
  const result = planLspSignatureAssistance({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    position: { line: 1, character: 2 },
    governance: { accepted: false, reason: "signature help blocked by runtime policy" },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("governance denial must be returned");
  }

  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  assert.equal(result.error.boundary, "governance");
  assert.match(result.error.message, /runtime policy/);
});
