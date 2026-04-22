import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  microphonePermissionRequestDescriptor,
  planMicrophonePermissionRequest,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/computeruseBase/microphoneAccess/computeruse.microphonePermissionRequest.md",
  testFileUrl: import.meta.url,
});

test("planMicrophonePermissionRequest creates a guarded dry-run permission request plan", () => {
  const result = planMicrophonePermissionRequest({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    targetApplication: "voice-capture",
    purpose: "transcribe user speech",
    mode: "single-capture",
    requestedDurationMs: 30_000,
    requestedScopes: ["tool:computeruse:microphone"],
    allowedScopes: ["tool:computeruse:microphone"],
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(microphonePermissionRequestDescriptor.requiresTapApproval, true);
  assert.equal(result.plan.tool, "computeruse.microphonePermissionRequest");
  assert.equal(result.plan.targetApplication, "voice-capture");
  assert.equal(result.plan.purpose, "transcribe user speech");
  assert.equal(result.plan.mode, "single-capture");
  assert.equal(result.plan.requestedDurationMs, 30_000);
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.wouldRequestPermission, true);
  assert.equal(result.plan.unsafeSideEffects, false);
});

test("planMicrophonePermissionRequest rejects missing purpose and duration over limit", () => {
  const missingPurpose = planMicrophonePermissionRequest({
    targetApplication: "voice-capture",
  });
  assert.equal(missingPurpose.ok, false);
  if (missingPurpose.ok) {
    assert.fail("missing purpose must be rejected");
  }
  assert.equal(missingPurpose.error.code, "MISSING_PURPOSE");
  assert.equal(missingPurpose.error.boundary, "input");

  const overLimit = planMicrophonePermissionRequest({
    targetApplication: "voice-capture",
    purpose: "transcribe user speech",
    requestedDurationMs: 10_001,
    maxDurationMs: 10_000,
  });
  assert.equal(overLimit.ok, false);
  if (overLimit.ok) {
    assert.fail("duration over limit must be rejected");
  }
  assert.equal(overLimit.error.code, "DURATION_LIMIT_EXCEEDED");
  assert.equal(overLimit.error.boundary, "resource");
});
