import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  lspApplyCodeActionDescriptor,
  planLspApplyCodeAction,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_applyCodeAction.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_applyCodeAction.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_applyCodeAction.md",
  testFileUrl: import.meta.url,
});

test("planLspApplyCodeAction creates a guarded dry-run code action plan", () => {
  const result = planLspApplyCodeAction({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    actionId: "quickfix.add-missing-import",
    actionTitle: "Add missing import",
    actionKind: "quickfix",
    editPreview: {
      filesTouched: ["src/index.ts"],
      diagnosticsResolved: ["ts2304"],
      summary: "would add one import",
    },
    requestedScopes: ["tool:lsp", "workspace:write"],
    allowedScopes: ["tool:lsp", "workspace:write"],
    auditContext: { correlationId: "corr-1" },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(lspApplyCodeActionDescriptor.sideEffectPolicy, "dry-run-only");
  assert.equal(result.plan.toolId, "code.lsp_applyCodeAction");
  assert.equal(result.plan.action.title, "Add missing import");
  assert.equal(result.plan.permissions.approvalRequired, true);
  assert.deepEqual(result.plan.permissions.acceptedScopes, ["tool:lsp", "workspace:write"]);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.lspInvoked, false);
  assert.equal(result.plan.execution.editApplied, false);
});

test("planLspApplyCodeAction rejects empty input with inspection-safe errors", () => {
  const result = planLspApplyCodeAction();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
});

test("planLspApplyCodeAction blocks real edit side effects", () => {
  const result = planLspApplyCodeAction({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    workspaceRoot: "/workspace/app",
    documentUri: "file:///workspace/app/src/index.ts",
    actionTitle: "Apply quick fix",
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real LSP edits must be blocked in the first-round envelope");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["basicTool.lsp.applyCodeAction.rejected"]);
});
