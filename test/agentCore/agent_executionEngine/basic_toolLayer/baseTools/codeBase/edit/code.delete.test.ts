import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  codeDeleteDescriptor,
  planCodeDelete,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.delete.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.delete.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/edit/code.delete.md",
  testFileUrl: import.meta.url,
});

test("planCodeDelete creates a guarded dry-run delete plan", () => {
  const result = planCodeDelete({
    workspaceRoot: " /workspace ",
    targetPath: "./src/old.ts",
    deleteKind: "code-range",
    range: { startLine: 3, endLine: 5 },
    reason: "remove stale branch",
    requestedScopes: ["tool:code:edit"],
    allowedScopes: ["tool:code:edit"],
    metadata: { ticket: "AC-G-0005" },
  });

  assert.equal(result.ok, true);
  assert.equal(codeDeleteDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.tool, "code.delete");
  assert.equal(result.plan.targetPath, "src/old.ts");
  assert.equal(result.plan.deleteKind, "code-range");
  assert.deepEqual(result.plan.range, { startLine: 3, endLine: 5 });
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.dryRun, true);
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.requiresTapApproval, true);
});

test("planCodeDelete rejects unsafe or incomplete delete requests", () => {
  const missing = planCodeDelete({ workspaceRoot: "/workspace" });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_TARGET_PATH");
  assert.equal(missing.error.boundary, "input");

  const escaped = planCodeDelete({ workspaceRoot: "/workspace", targetPath: "../outside.ts" });
  assert.equal(escaped.ok, false);
  assert.equal(escaped.error.code, "TARGET_OUT_OF_SCOPE");
  assert.equal(escaped.error.boundary, "scope");

  const realSideEffect = planCodeDelete({
    workspaceRoot: "/workspace",
    targetPath: "src/old.ts",
    dryRun: false,
  });
  assert.equal(realSideEffect.ok, false);
  assert.equal(realSideEffect.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(realSideEffect.error.boundary, "governance");
});
