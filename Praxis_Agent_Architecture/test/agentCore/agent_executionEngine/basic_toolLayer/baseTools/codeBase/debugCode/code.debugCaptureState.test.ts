import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  codeDebugCaptureStateDescriptor,
  planCodeDebugCaptureState,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/debugCode/code.debugCaptureState.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/debugCode/code.debugCaptureState.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/debugCode/code.debugCaptureState.md",
  testFileUrl: import.meta.url,
});

test("planCodeDebugCaptureState creates a dry-run capture envelope and storage plan", () => {
  const result = planCodeDebugCaptureState({
    runtimeId: " runtime-1 ",
    sessionId: " session-1 ",
    target: {
      kind: "debug-session",
      id: " debug-1 ",
      cwd: " /workspace ",
    },
    capture: {
      includeVariables: true,
      maxVariables: 25,
    },
    requestedScopes: ["debug:read"],
    allowedScopes: ["debug:read"],
  });

  assert.equal(codeDebugCaptureStateDescriptor.unsafeSideEffects, false);
  if (!result.ok) {
    assert.fail("valid debug capture request must be accepted");
  }

  assert.equal(result.plan.toolName, "code.debugCaptureState");
  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.sessionId, "session-1");
  assert.equal(result.plan.target.id, "debug-1");
  assert.equal(result.plan.target.cwd, "/workspace");
  assert.equal(result.plan.capture.includeStack, true);
  assert.equal(result.plan.capture.includeVariables, true);
  assert.equal(result.plan.execution.dryRun, true);
  assert.equal(result.plan.execution.captured, false);
  assert.equal(result.plan.storage.logic.persisted, false);
  assert.equal(result.plan.storage.records[0]?.toolName, "code.debugCaptureState");
});

test("planCodeDebugCaptureState rejects missing target and real capture attempts", () => {
  const missingTarget = planCodeDebugCaptureState({
    runtimeId: "runtime-1",
    sessionId: "session-1",
  });
  assert.equal(missingTarget.ok, false);
  if (missingTarget.ok) {
    assert.fail("missing target must be rejected");
  }
  assert.equal(missingTarget.error.code, "MISSING_TARGET");
  assert.equal(missingTarget.error.boundary, "input");

  const realCapture = planCodeDebugCaptureState({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    target: { kind: "process", id: "pid-1" },
    dryRun: false,
  });
  assert.equal(realCapture.ok, false);
  if (realCapture.ok) {
    assert.fail("real debug capture must be rejected");
  }
  assert.equal(realCapture.error.code, "REAL_DEBUG_CAPTURE_NOT_ALLOWED");
  assert.equal(realCapture.error.boundary, "governance");
});

test("planCodeDebugCaptureState rejects invalid capture limits and scope denial", () => {
  const invalidLimit = planCodeDebugCaptureState({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    target: { kind: "test-run", id: "test-1" },
    capture: { maxVariables: -1 },
  });
  assert.equal(invalidLimit.ok, false);
  if (invalidLimit.ok) {
    assert.fail("negative capture limit must be rejected");
  }
  assert.equal(invalidLimit.error.code, "INVALID_CAPTURE_LIMIT");

  const denied = planCodeDebugCaptureState({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    target: { kind: "workspace", id: "repo-1" },
    requestedScopes: ["debug:read"],
    allowedScopes: [],
  });
  assert.equal(denied.ok, false);
  if (denied.ok) {
    assert.fail("scope denial must be rejected");
  }
  assert.equal(denied.error.code, "SCOPE_DENIED");
  assert.equal(denied.error.boundary, "scope");
});
