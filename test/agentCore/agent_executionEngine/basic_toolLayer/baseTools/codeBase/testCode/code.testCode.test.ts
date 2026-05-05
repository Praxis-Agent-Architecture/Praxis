import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  codeTestDescriptor,
  planCodeTest,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/testCode/code.testCode.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/testCode/code.testCode.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/testCode/code.testCode.md",
  testFileUrl: import.meta.url,
});

test("planCodeTest creates a dry-run test envelope without executing tests", () => {
  const result = planCodeTest({
    runtimeId: "runtime-1",
    workspaceRoot: "/workspace/praxis",
    testTarget: "test/unit/example.test.ts",
    command: ["npm", "test"],
    testFramework: "node:test",
    requestedScopes: ["tool:code"],
    allowedScopes: ["tool:code"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(codeTestDescriptor.unsafeSideEffects, false);
  assert.equal(result.plan.toolKind, "code.testCode");
  assert.equal(result.plan.testTarget, "test/unit/example.test.ts");
  assert.deepEqual(result.plan.command, ["npm", "test"]);
  assert.equal(result.plan.testFramework, "node:test");
  assert.deepEqual(result.plan.permissions, ["workspace:read", "process:spawn:dry-run"]);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.testsExecuted, false);
  assert.equal(result.plan.execution.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.code.testCode.planned"]);
});

test("planCodeTest rejects missing runtime context", () => {
  const result = planCodeTest();

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("empty input must be rejected");
  }

  assert.equal(result.error.code, "MISSING_RUNTIME_ID");
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
});

test("planCodeTest rejects attempts to leave dry-run mode", () => {
  const result = planCodeTest({
    runtimeId: "runtime-1",
    workspaceRoot: "/workspace/praxis",
    testTarget: "test/unit/example.test.ts",
    dryRun: false,
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("real test execution must be rejected");
  }

  assert.equal(result.error.code, "REAL_SIDE_EFFECT_NOT_ALLOWED");
  assert.equal(result.error.boundary, "governance");
  assert.deepEqual(result.events, ["basicTool.code.testCode.rejected"]);
});
